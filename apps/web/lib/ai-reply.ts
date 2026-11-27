import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_TONES, HANDOFF_MARKER, channelSupportsAi, customerFirstName, MAX_OPTION_CHARS, MAX_QUICK_OPTIONS, OPTIONS_MARKER, buildSystemPrompt, normalizeBusinessHours,
  type AiProvider, type AiTone, type KnowledgeItem,
} from './ai-agent';
import type { ChatTurn, GenerateFn } from './ai-llm';
import { friendlyAiError } from './ai-llm';
import { friendlySendError, pickProviderMessageId, type SendFn } from './inbox-send';
import { friendlyMetaSendError } from './meta-client';
import { isOrganizationBlocked } from './trial';
import { aiSigner, normalizeSignature, signText } from './signature';
import { monthStartIso, normalizeLimits, normalizePricing, resolveMonthlyLimit, estimateCostUsd } from './ai-limits';
import {
  INVALID_DOCUMENT_MESSAGE, LOOKUP_FAILED_MESSAGE, LOOKUP_LIMIT_MESSAGE, MAX_BOLETO_LOOKUPS_PER_DAY, MAX_BOLETOS_PER_MESSAGE,
  extractBoletoRequest, formatBoletoMessage, maskDocument, normalizeDocument, notFoundMessage, sortBoletos,
} from './boleto';
import type { BoletoService } from './boleto-server';

/**
 * Resposta automática do agente de IA no WhatsApp, no Webchat e no Instagram (o Messenger fica
 * só com a equipe).
 *
 * Disparada pelo webhook depois que uma mensagem do cliente é gravada numa conversa com a IA ligada
 * (conversations.ai_mode = 'on'). Fluxo:
 *  1. espera alguns segundos: o cliente costuma mandar várias mensagens seguidas, e a IA responde uma vez só;
 *  2. confere se esta ainda é a última mensagem da conversa (se chegou outra, aquela responde; se um
 *     atendente respondeu, a IA fica quieta);
 *  3. confere agente liberado, plano com IA e teste em dia;
 *  4. "trava" a conversa para esta mensagem (ai_replied_to_message_id): reentregas do webhook nunca
 *     geram duas respostas;
 *  5. monta o prompt, chama o modelo e envia pela D-API, identificando a mensagem como da IA;
 *  6. se o modelo pedir um humano (marcador), envia o aviso e passa a conversa para 'handoff'.
 * Cada tentativa fica registrada em ai_usage_events (tokens, resultado), base para limites e cobrança.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, unknown>;

export const AI_DEBOUNCE_MS = 4_000;
/** Teto de respostas da IA por conversa em 24 h. Passou disso, chama um atendente. */
export const MAX_AI_REPLIES_PER_DAY = 40;
const HISTORY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AiTrigger = { organizationId: string; conversationId: string; messageId: string };
/** Envio de texto pelo Instagram (Graph API da Meta). Quem implementa busca o token da página no Vault. */
export type InstagramSendFn = (input: { connectionId: string; accountId: string; recipientId: string; text: string }) => Promise<unknown>;
export type AiReplyDeps = {
  generate: GenerateFn;
  send: SendFn;
  /** Só é usado nas conversas do Instagram. */
  sendInstagram?: InstagramSendFn;
  resolveKey: (provider: AiProvider) => Promise<string | null>;
  /** 2ª via de boleto (plano Pro com integração de cobrança). Sem isto, a IA não oferece boleto. */
  boleto?: BoletoService;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};
export type AiReplyResult = { status: 'replied' | 'handoff' | 'skipped' | 'error'; reason?: string };
/**
 * A Meta só aceita mensagem da empresa até 24 h depois da última mensagem do cliente
 * (sem tags especiais). Fora disso a IA não envia e deixa a conversa com a equipe.
 */
export const META_REPLY_WINDOW_MS = DAY_MS;

/** Erro da Graph API de mensagem fora da janela permitida. */
function isOutsideWindowError(message: string): boolean {
  return /outside (of )?(the )?allowed window|2018278/i.test(message);
}

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Separa o marcador de transferência do texto que vai para o cliente. */
export function splitHandoff(raw: string): { text: string; handoff: boolean } {
  const handoff = raw.includes(HANDOFF_MARKER);
  const cleaned = raw.split(HANDOFF_MARKER).join('').replace(/\n{3,}/g, '\n\n').trim();
  return { text: cleaned, handoff };
}

const OPTIONS_PATTERN = new RegExp(`\\[\\[\\s*${OPTIONS_MARKER}\\s*:([^\\]]*)\\]\\]`, 'gi');

/**
 * Tira o marcador de opções rápidas da resposta da IA.
 * Devolve o texto limpo e até 3 opções curtas, sem repetidas. Marcador inválido some sem deixar resto.
 */
export function extractQuickOptions(raw: string): { text: string; options: string[] } {
  let options: string[] = [];
  const text = raw.replace(OPTIONS_PATTERN, (_match, list: string) => {
    if (!options.length) {
      const seen = new Set<string>();
      options = list
        .split('|')
        .map(item => item.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_OPTION_CHARS).trim())
        .filter(item => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
        .slice(0, MAX_QUICK_OPTIONS);
    }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, options: options.length >= 2 ? options : [] };
}

/** Texto final com as opções numeradas ("1. Sim"), que o cliente responde com o número. */
export function withQuickOptions(text: string, options: string[]): string {
  if (!options.length) return text;
  return `${text}\n\n${options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`;
}

export type NativeflowButton = { type: 'quick_reply'; title: string; id: string };

/** Botões nativos do WhatsApp (D-API `/interactive/send/nativeflow`) para as opções rápidas da IA. */
export function buildNativeflowButtons(options: string[]): NativeflowButton[] {
  return options.map((option, index) => ({ type: 'quick_reply', title: option, id: `opt-${index + 1}` }));
}

const MEDIA_NOTES: Record<string, string> = {
  audio: '[O cliente enviou um áudio. Você não consegue ouvir áudios: peça com gentileza que ele escreva a mensagem.]',
  image: '[O cliente enviou uma imagem que você não consegue ver.]',
  video: '[O cliente enviou um vídeo que você não consegue ver.]',
  document: '[O cliente enviou um documento que você não consegue abrir.]',
  sticker: '[O cliente enviou uma figurinha.]',
  location: '[O cliente enviou uma localização.]',
};

/** Converte as mensagens do banco (mais antigas primeiro) no histórico que o modelo lê. */
export function toChatTurns(rows: Array<{ direction: string; message_type: string; body: string | null }>): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const row of rows) {
    if (row.direction !== 'inbound' && row.direction !== 'outbound') continue;
    const body = (row.body ?? '').trim();
    const note = row.direction === 'inbound' ? MEDIA_NOTES[row.message_type] : undefined;
    const content = [note, body && !/^\[[a-z_]+\]$/.test(body) ? body : ''].filter(Boolean).join('\n');
    if (!content) continue;
    turns.push({ role: row.direction === 'inbound' ? 'user' : 'assistant', content });
  }
  return turns;
}

async function logUsage(db: Db, row: Json) {
  const { error } = await db.from('ai_usage_events').insert(row);
  if (error) console.warn('[IA] uso não registrado', { message: error.message });
}

/**
 * Consulta da 2ª via pedida pela IA. Devolve o texto para o cliente; `meta` vai no payload da
 * mensagem (com o documento mascarado), e serve para contar as consultas da conversa.
 */
async function resolveBoleto(
  db: Db,
  service: BoletoService,
  input: { organizationId: string; conversationId: string; document: string; since: string },
): Promise<{ text: string; handoff: boolean; meta: Json }> {
  const document = normalizeDocument(input.document);
  if (!document) return { text: INVALID_DOCUMENT_MESSAGE, handoff: false, meta: { lookup: false, invalid: true } };
  const recent = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', input.conversationId)
    .contains('payload', { boleto: { lookup: true } })
    .gte('created_at', input.since);
  if ((recent.count ?? 0) >= MAX_BOLETO_LOOKUPS_PER_DAY) return { text: LOOKUP_LIMIT_MESSAGE, handoff: true, meta: { lookup: false, limited: true } };
  const masked = maskDocument(document);
  try {
    const boletos = await service.find(input.organizationId, document);
    if (!boletos.length) return { text: notFoundMessage(document), handoff: false, meta: { lookup: true, found: 0, document: masked } };
    const sent = sortBoletos(boletos).slice(0, MAX_BOLETOS_PER_MESSAGE).map(boleto => boleto.id);
    return { text: formatBoletoMessage(boletos), handoff: false, meta: { lookup: true, found: boletos.length, document: masked, ids: sent } };
  } catch (error) {
    console.warn('[IA][Boleto] consulta falhou', { conversationId: input.conversationId, message: error instanceof Error ? error.message : String(error) });
    return { text: LOOKUP_FAILED_MESSAGE, handoff: true, meta: { lookup: true, error: true, document: masked } };
  }
}

export async function runAiAutoReply(db: Db, trigger: AiTrigger, deps: AiReplyDeps): Promise<AiReplyResult> {
  const now = deps.now ?? (() => new Date());
  await (deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(AI_DEBOUNCE_MS);
  const { organizationId, conversationId, messageId } = trigger;
  const usage = { organization_id: organizationId, conversation_id: conversationId };

  // 1) Conversa com a IA ligada.
  const conversationResult = await db
    .from('conversations')
    .select('id,organization_id,channel,ai_mode,contacts(phone_e164,full_name,external_id)')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (conversationResult.error) throw new Error(`conversations: ${conversationResult.error.message}`);
  const conversation = conversationResult.data as { channel: string; ai_mode: string; contacts: any } | null;
  if (!conversation || !channelSupportsAi(conversation.channel)) return { status: 'skipped', reason: 'conversation_not_found' };
  if (conversation.ai_mode !== 'on') return { status: 'skipped', reason: 'ai_off' };

  // 2) Esta precisa ser a última mensagem da conversa.
  const latestResult = await db
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .neq('direction', 'internal')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw new Error(`messages.latest: ${latestResult.error.message}`);
  if ((latestResult.data as { id: string } | null)?.id !== messageId) return { status: 'skipped', reason: 'newer_message' };

  // 3) Agente liberado, plano com IA e empresa em dia.
  const [agentResult, orgResult] = await Promise.all([
    db.from('ai_agents').select('name,is_enabled,niche,tone,system_instructions,provider,model,monthly_reply_limit,whatsapp_buttons_enabled').eq('organization_id', organizationId).maybeSingle(),
    db.from('organizations').select('name,status,plan_code,trial_ends_at,complimentary_since,complimentary_until').eq('id', organizationId).maybeSingle(),
  ]);
  const agent = agentResult.data as { name: string; is_enabled: boolean; niche: string; tone: string; system_instructions: string; provider: string | null; model: string | null; monthly_reply_limit?: number | null; whatsapp_buttons_enabled?: boolean } | null;
  const org = orgResult.data as { name: string; status: string; plan_code: string | null; trial_ends_at: string | null; complimentary_since?: string | null; complimentary_until?: string | null } | null;
  if (!agent?.is_enabled) return { status: 'skipped', reason: 'agent_disabled' };
  if (!org) return { status: 'skipped', reason: 'organization_not_found' };
  if (isOrganizationBlocked(org, now()) || ['canceled', 'cancelled', 'inactive'].includes(org.status)) {
    return { status: 'skipped', reason: 'organization_inactive' };
  }
  let planLimit: number | null = null;
  // Botões nativos do WhatsApp são um recurso do plano Pro para cima (coluna no plano); Start fica
  // com a lista numerada de sempre, mesmo com o agente marcado para usar botões.
  let planAllowsWhatsappButtons = false;
  if (org.plan_code) {
    const plan = await db.from('subscription_plans').select('ai_enabled,ai_monthly_replies,whatsapp_buttons_enabled').eq('code', org.plan_code).maybeSingle();
    const planRow = plan.data as { ai_enabled: boolean; ai_monthly_replies?: number | null; whatsapp_buttons_enabled?: boolean } | null;
    if (planRow?.ai_enabled === false) return { status: 'skipped', reason: 'plan_without_ai' };
    planLimit = planRow?.ai_monthly_replies ?? null;
    planAllowsWhatsappButtons = planRow?.whatsapp_buttons_enabled === true;
  }

  // 4) Trava: só um processamento por mensagem.
  const claim = await db
    .from('conversations')
    .update({ ai_replied_to_message_id: messageId })
    .eq('id', conversationId)
    .or(`ai_replied_to_message_id.is.null,ai_replied_to_message_id.neq.${messageId}`)
    .select('id');
  if (claim.error) throw new Error(`conversations.claim: ${claim.error.message}`);
  if (!Array.isArray(claim.data) || claim.data.length === 0) return { status: 'skipped', reason: 'already_claimed' };

  // 5) Limite diário por conversa (protege contra loops e conversas intermináveis).
  const since = new Date(now().getTime() - DAY_MS).toISOString();
  const used = await db
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .in('outcome', ['replied', 'handoff'])
    .gte('created_at', since);
  if ((used.count ?? 0) >= MAX_AI_REPLIES_PER_DAY) {
    await db.from('conversations').update({ ai_mode: 'handoff' }).eq('id', conversationId);
    await logUsage(db, { ...usage, outcome: 'limit', error: `Limite de ${MAX_AI_REPLIES_PER_DAY} respostas em 24 h.` });
    return { status: 'handoff', reason: 'daily_limit' };
  }

  // 6) Limite mensal da empresa (a IA é paga pela plataforma: protege a margem de cada plano).
  const settingRows = await db.from('platform_settings').select('key,value').in('key', ['ai', 'ai_limits', 'ai_pricing']);
  const settingOf = (key: string) => ((settingRows.data ?? []) as Array<{ key: string; value: unknown }>).find(row => row.key === key)?.value;
  const monthlyLimit = resolveMonthlyLimit({
    agentLimit: agent.monthly_reply_limit ?? null,
    planLimit,
    isTrial: org.status === 'trial',
    settings: normalizeLimits(settingOf('ai_limits')),
  });
  const monthUsed = await db
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('outcome', ['replied', 'handoff'])
    .gte('created_at', monthStartIso(now()));
  if ((monthUsed.count ?? 0) >= monthlyLimit) {
    await db.from('conversations').update({ ai_mode: 'handoff' }).eq('id', conversationId);
    await logUsage(db, { ...usage, outcome: 'limit', error: `Limite mensal de ${monthlyLimit} respostas da IA atingido.` });
    return { status: 'handoff', reason: 'monthly_limit' };
  }
  const pricing = normalizePricing(settingOf('ai_pricing'));

  // 7) Provedor, modelo e chave.
  const aiSetting = settingOf('ai');
  const global = isRecord(aiSetting) ? (aiSetting as Json) : {};
  const globalProvider: AiProvider = global.provider === 'openai' ? 'openai' : 'anthropic';
  const provider: AiProvider = agent.provider === 'openai' || agent.provider === 'anthropic' ? agent.provider : globalProvider;
  const models = isRecord(global.models) ? global.models : {};
  const model = (agent.model ?? '').trim() || text(models[provider]).trim();
  const fail = async (reason: string, extra: Json = {}): Promise<AiReplyResult> => {
    await logUsage(db, { ...usage, provider, model: model || null, outcome: 'error', error: reason.slice(0, 500), ...extra });
    return { status: 'error', reason };
  };
  if (!model) return fail('Modelo de IA não definido. Configure o modelo padrão em Super Admin > Agentes de IA.');
  const apiKey = await deps.resolveKey(provider);
  if (!apiKey) return fail(`Chave de API do provedor ${provider} não configurada.`);

  // 8) Contexto: informações do negócio, base de conhecimento e histórico.
  const [profileResult, knowledgeResult, historyResult] = await Promise.all([
    db.from('ai_business_profiles').select('*').eq('organization_id', organizationId).maybeSingle(),
    db.from('ai_knowledge_items').select('title,content,is_active').eq('organization_id', organizationId).eq('is_active', true).order('created_at'),
    db.from('messages').select('direction,message_type,body,created_at,sent_at').eq('conversation_id', conversationId).neq('direction', 'internal')
      .order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
  ]);
  if (historyResult.error) throw new Error(`messages.history: ${historyResult.error.message}`);

  // Instagram: fora da janela de 24 h da Meta a resposta seria recusada. Nem chama o modelo:
  // passa a conversa para a equipe (que pode responder quando o cliente voltar a escrever).
  const isInstagram = conversation.channel === 'instagram';
  if (isInstagram) {
    const rows = (historyResult.data ?? []) as Array<{ direction: string; created_at?: string | null; sent_at?: string | null }>;
    const lastInbound = rows.find(row => row.direction === 'inbound');
    const lastAt = Date.parse(text(lastInbound?.sent_at) || text(lastInbound?.created_at));
    if (!Number.isFinite(lastAt) || now().getTime() - lastAt > META_REPLY_WINDOW_MS) {
      await db.from('conversations').update({ ai_mode: 'handoff' }).eq('id', conversationId);
      return { status: 'handoff', reason: 'outside_24h_window' };
    }
  }
  const profile = (profileResult.data ?? {}) as Json;
  // 2ª via de boleto: só com plano Pro e integração de cobrança ligada. Falha aqui não impede a resposta.
  const boletoEnabled = deps.boleto ? await deps.boleto.available(organizationId).catch(() => false) : false;
  const tone = (AI_TONES.some(item => item.value === agent.tone) ? agent.tone : 'cordial') as AiTone;
  const system = buildSystemPrompt({
    agentName: agent.name,
    companyName: org.name,
    niche: agent.niche ?? '',
    tone,
    instructions: agent.system_instructions ?? '',
    profile: {
      company_description: text(profile.company_description),
      products_services: text(profile.products_services),
      policies: text(profile.policies),
      greeting_message: text(profile.greeting_message),
    },
    knowledge: (knowledgeResult.data ?? []) as KnowledgeItem[],
    hours: normalizeBusinessHours(profile.business_hours),
    timezone: text(profile.timezone) || 'America/Fortaleza',
    boleto: boletoEnabled,
    customerName: (() => { const c = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts; return customerFirstName(c?.full_name, c?.phone_e164); })(),
    now: now(),
  });
  const history = [...((historyResult.data ?? []) as Array<{ direction: string; message_type: string; body: string | null }>)].reverse();

  // 9) Chamada ao modelo.
  let generated;
  try {
    generated = await deps.generate({ provider, model, apiKey, system, messages: toChatTurns(history) });
  } catch (error) {
    return fail(friendlyAiError(error));
  }
  const tokens = {
    input_tokens: generated.inputTokens,
    output_tokens: generated.outputTokens,
    cost_usd: estimateCostUsd(pricing, model, generated.inputTokens, generated.outputTokens),
  };
  const handoffParsed = generated.refused ? { text: '', handoff: true } : splitHandoff(generated.text);
  // 2ª via: a IA devolve [[SEGUNDA_VIA: documento]] e o servidor monta a mensagem com o boleto.
  const boletoAsk = extractBoletoRequest(handoffParsed.text);
  let replyText = boletoAsk.text;
  let boletoHandoff = false;
  let boletoMeta: Json | null = null;
  if (boletoAsk.requested) {
    if (boletoEnabled && deps.boleto) {
      const outcome = await resolveBoleto(db, deps.boleto, { organizationId, conversationId, document: boletoAsk.document, since });
      replyText = outcome.text;
      boletoHandoff = outcome.handoff;
      boletoMeta = outcome.meta;
    } else {
      // Marcador sem integração (não deveria acontecer): a equipe assume.
      replyText = '';
      boletoHandoff = true;
    }
  }
  // Opções rápidas ([[OPCOES: ...]]) viram lista numerada no fim da mensagem.
  const quick = extractQuickOptions(replyText);
  const parsed = { handoff: handoffParsed.handoff || boletoHandoff, text: withQuickOptions(quick.text, quick.options) };
  const handoffMessage = text(profile.handoff_message).trim() || 'Vou chamar um atendente da nossa equipe para continuar com você. Só um instante!';
  const reply = parsed.text || (parsed.handoff ? handoffMessage : '');
  if (!reply) return fail('O modelo devolveu uma resposta vazia.', tokens);

  // 10) Entrega. WhatsApp fala com a D-API; Instagram com a Graph API da Meta; Webchat só grava
  // (quem lê é o navegador do visitante, que consulta /api/webchat/messages — não há provedor externo).
  const isWebchat = conversation.channel === 'webchat';
  const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
  let signer = '';
  let sessionId = '';
  let phone = '';
  let instagram: { connectionId: string; accountId: string; recipientId: string } | null = null;

  if (isInstagram) {
    const externalId = text(contact?.external_id);
    const recipientId = externalId.startsWith('instagram:') ? externalId.slice('instagram:'.length) : '';
    const [connection, workspace] = await Promise.all([
      db.from('channel_connections').select('id,provider_account_id,status').eq('organization_id', organizationId).eq('channel', 'instagram').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      // A assinatura é uma configuração da empresa (guardada na conexão do WhatsApp, em Configurações).
      db.from('channel_connections').select('settings').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
    ]);
    const accountId = text(connection.data?.provider_account_id);
    if (!recipientId) return fail('O contato não tem um ID do Instagram válido.', tokens);
    if (!accountId || connection.data?.status !== 'connected') return fail('Instagram da empresa desconectado.', tokens);
    if (!deps.sendInstagram) return fail('Envio pelo Instagram indisponível no servidor.', tokens);
    instagram = { connectionId: text(connection.data?.id), accountId, recipientId };
    const signature = normalizeSignature(workspace.data?.settings);
    signer = signature.enabled ? aiSigner(agent.name, signature.aiSuffix) : '';
  } else if (!isWebchat) {
    phone = text(contact?.phone_e164).replace(/\D/g, '');
    const connection = await db
      .from('channel_connections')
      .select('provider_account_id,status,settings')
      .eq('organization_id', organizationId)
      .eq('channel', 'whatsapp')
      .maybeSingle();
    sessionId = text(connection.data?.provider_account_id);
    if (!/^\d{8,15}$/.test(phone)) return fail('O contato não tem um número de WhatsApp válido.', tokens);
    if (!sessionId || connection.data?.status !== 'connected') return fail('WhatsApp da empresa desconectado.', tokens);
    const signature = normalizeSignature(connection.data?.settings);
    signer = signature.enabled ? aiSigner(agent.name, signature.aiSuffix) : '';
  }

  // No WhatsApp (não Instagram/Webchat), 2 ou 3 opções rápidas viram botões nativos em vez de lista
  // numerada — só quando a resposta não foi substituída pela mensagem fixa de transferência, o plano
  // permite (Pro para cima) e o agente não desligou o recurso.
  const useButtons = !isWebchat && !isInstagram && quick.options.length >= 2 && reply === parsed.text
    && planAllowsWhatsappButtons && agent.whatsapp_buttons_enabled !== false;
  const nativeButtons = useButtons ? buildNativeflowButtons(quick.options) : null;
  const basePayload = { source: 'ai', sender: { type: 'ai', name: agent.name }, ...(signer ? { signature: signer } : {}), ai: { provider, model, handoff: parsed.handoff, ...(quick.options.length ? { options: quick.options } : {}) }, ...(boletoMeta ? { boleto: boletoMeta } : {}), ...(nativeButtons ? { interactive: { type: 'nativeflow', buttons: nativeButtons } } : {}) };
  const inserted = await db
    .from('messages')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: nativeButtons ? 'interactive' : 'text',
      body: reply,
      delivery_status: 'queued',
      provider: isWebchat ? 'webchat' : isInstagram ? 'instagram' : 'd-api',
      sent_at: now().toISOString(),
      payload: basePayload,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) return fail('Não foi possível registrar a resposta da IA.', tokens);
  const rowId = (inserted.data as { id: string }).id;

  if (isWebchat) {
    await db.from('messages').update({ delivery_status: 'sent', sent_at: now().toISOString() }).eq('id', rowId);
  } else {
    try {
      const response = instagram && deps.sendInstagram
        ? await deps.sendInstagram({ ...instagram, text: signText(reply, signer, 'plain') })
        : nativeButtons
          ? await deps.send('/interactive/send/nativeflow', { sessionId, to: phone, body: signText(quick.text, signer), buttons: nativeButtons })
          : await deps.send('/messages/send/text', { sessionId, to: phone, text: signText(reply, signer) });
      const providerMessageId = pickProviderMessageId(response);
      const patch = { delivery_status: 'sent', sent_at: now().toISOString() };
      const update = await db.from('messages').update(providerMessageId ? { ...patch, provider_message_id: providerMessageId } : patch).eq('id', rowId);
      if (update.error && providerMessageId) await db.from('messages').update(patch).eq('id', rowId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await db.from('messages').update({ delivery_status: 'failed', payload: { ...basePayload, error: reason.slice(0, 300) } }).eq('id', rowId);
      if (isInstagram) {
        // A Meta recusou por janela vencida: a equipe assume a conversa.
        if (isOutsideWindowError(reason)) await db.from('conversations').update({ ai_mode: 'handoff' }).eq('id', conversationId);
        return fail(friendlyMetaSendError(error), tokens);
      }
      return fail(friendlySendError(reason), tokens);
    }
  }

  await db
    .from('conversations')
    .update({ last_message_at: now().toISOString(), status: 'open', ...(parsed.handoff ? { ai_mode: 'handoff' } : {}) })
    .eq('id', conversationId);
  await logUsage(db, { ...usage, provider, model, ...tokens, outcome: parsed.handoff ? 'handoff' : 'replied' });
  return { status: parsed.handoff ? 'handoff' : 'replied' };
}
