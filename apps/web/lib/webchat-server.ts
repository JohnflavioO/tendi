import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_BUCKET } from './inbox-attachments';
import { initialAiMode } from './dapi-webhook';
import { WEBCHAT_SESSION_DAYS } from './webchat';
import { canRequestHuman, normalizeWebchatSettings, webchatState, type VisitorIdentity, type WebchatSettings, type WebchatState } from './webchat-config';
import { ensureLeadForContact } from './crm-lead';
import { describeBusinessHours, isWithinBusinessHours, normalizeBusinessHours } from './ai-agent';

/**
 * Webchat no servidor: o visitante nunca fala direto com o Supabase, só com as rotas
 * /api/webchat/*, que usam a chave de serviço. Este arquivo concentra essas operações.
 */

type Db = SupabaseClient<any, any, any>;

export function newWebchatToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('hex');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export const hashWebchatToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export type WebchatWidget = { id: string; organization_id: string; is_enabled: boolean; display_name: string; greeting_message: string; color: string; ai_enabled?: boolean | null };

export const ANONYMOUS_VISITOR_NAME = 'Visitante do site';

/**
 * Contato do visitante. Com telefone, reaproveita o contato que a empresa já tem com esse número
 * (ex.: quem já falou pelo WhatsApp) e só completa o que estiver vazio, sem sobrescrever dados.
 */
async function resolveVisitorContact(admin: Db, organizationId: string, identity: VisitorIdentity | null): Promise<{ id: string; created: boolean }> {
  if (identity?.phone) {
    const existing = await admin.from('contacts').select('id,full_name,email').eq('organization_id', organizationId).eq('phone_e164', identity.phone).maybeSingle();
    const row = existing.data as { id: string; full_name: string | null; email: string | null } | null;
    if (row) {
      const patch: Record<string, string> = {};
      const currentName = (row.full_name ?? '').trim();
      // Nome vazio, "Visitante do site" ou só o número: troca pelo nome informado.
      if (!currentName || currentName === ANONYMOUS_VISITOR_NAME || currentName.replace(/\D/g, '') === identity.phone.replace(/\D/g, '')) patch.full_name = identity.name;
      if (!row.email && identity.email) patch.email = identity.email;
      if (Object.keys(patch).length) await admin.from('contacts').update(patch).eq('id', row.id);
      return { id: row.id, created: false };
    }
  }
  const inserted = await admin.from('contacts')
    .insert({
      organization_id: organizationId,
      full_name: identity?.name || ANONYMOUS_VISITOR_NAME,
      ...(identity?.phone ? { phone_e164: identity.phone } : {}),
      ...(identity?.email ? { email: identity.email } : {}),
    })
    .select('id').single();
  if (inserted.error?.code === '23505' && identity?.phone) {
    // Outro pedido criou o mesmo número ao mesmo tempo: usa esse contato.
    const again = await admin.from('contacts').select('id').eq('organization_id', organizationId).eq('phone_e164', identity.phone).maybeSingle();
    if (again.data) return { id: (again.data as { id: string }).id, created: false };
  }
  if (inserted.error || !inserted.data) throw new Error(`Não foi possível iniciar a conversa: ${inserted.error?.message ?? 'sem retorno'}`);
  return { id: (inserted.data as { id: string }).id, created: true };
}

/** Cria (ou reaproveita) o contato, a conversa e a sessão de um visitante do widget. */
export async function startWebchatSession(admin: Db, widget: WebchatWidget, identity: VisitorIdentity | null = null): Promise<{ token: string; conversationId: string }> {
  const nowIso = new Date().toISOString();
  const contact = await resolveVisitorContact(admin, widget.organization_id, identity);
  let contactId = contact.id;

  // Lead identificado no funil de vendas (igual ao WhatsApp): só quando ainda não tem oportunidade.
  if (identity) {
    await ensureLeadForContact(admin, {
      organizationId: widget.organization_id, contactId, title: identity.name,
      description: 'Criada automaticamente a partir de uma nova conversa no chat do site.',
    }).catch(() => undefined);
  }

  const conversationRow = {
    organization_id: widget.organization_id, contact_id: contactId, channel: 'webchat', status: 'open',
    unread_count: 0, last_message_at: nowIso,
    // IA só quando a empresa deixou o Webchat com o agente (padrão) e o agente está liberado.
    // Atendimento manual: a conversa já nasce aguardando atendente (entra na fila da equipe).
    ai_mode: widget.ai_enabled === false ? 'handoff' : await initialAiMode(admin, widget.organization_id),
  };
  let conversation = await admin.from('conversations').insert(conversationRow).select('id').single();
  if (conversation.error?.code === '23505') {
    // Esse contato já tem uma conversa aberta pelo site, de outra sessão. Por privacidade o visitante
    // NÃO entra nela (quem digitou o número pode não ser o dono): abre um contato e uma conversa à parte.
    const separate = await admin.from('contacts')
      .insert({ organization_id: widget.organization_id, full_name: identity?.name || ANONYMOUS_VISITOR_NAME, ...(identity?.email ? { email: identity.email } : {}) })
      .select('id').single();
    if (separate.error || !separate.data) throw new Error(`Não foi possível iniciar a conversa: ${separate.error?.message ?? 'sem retorno'}`);
    contactId = (separate.data as { id: string }).id;
    conversation = await admin.from('conversations').insert({ ...conversationRow, contact_id: contactId }).select('id').single();
  }
  if (conversation.error || !conversation.data) throw new Error(`Não foi possível iniciar a conversa: ${conversation.error?.message ?? 'sem retorno'}`);
  const conversationId = (conversation.data as { id: string }).id;

  const { token, hash } = newWebchatToken();
  const expiresAt = new Date(Date.now() + WEBCHAT_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const session = await admin.from('webchat_sessions')
    .insert({ organization_id: widget.organization_id, contact_id: contactId, conversation_id: conversationId, token_hash: hash, expires_at: expiresAt });
  if (session.error) throw new Error(`Não foi possível iniciar a sessão: ${session.error.message}`);

  return { token, conversationId };
}

export type WebchatSession = { organizationId: string; contactId: string; conversationId: string; aiMode: string };

/** Sessão válida (não vencida) a partir do token do visitante, ou null. */
export async function loadWebchatSession(admin: Db, token: string): Promise<WebchatSession | null> {
  if (!token || token.length > 200) return null;
  const { data } = await admin.from('webchat_sessions')
    .select('organization_id,contact_id,conversation_id,expires_at,conversations(ai_mode)')
    .eq('token_hash', hashWebchatToken(token))
    .maybeSingle();
  if (!data) return null;
  const row = data as { organization_id: string; contact_id: string; conversation_id: string; expires_at: string; conversations: { ai_mode: string } | { ai_mode: string }[] | null };
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
  return { organizationId: row.organization_id, contactId: row.contact_id, conversationId: row.conversation_id, aiMode: conversation?.ai_mode ?? 'off' };
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_MESSAGES = 20;

/** Mensagens recebidas deste visitante no último minuto: trava um visitante que manda em excesso. */
async function recentInboundCount(admin: Db, conversationId: string): Promise<number> {
  const { count } = await admin.from('messages').select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId).eq('direction', 'inbound')
    .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  return count ?? 0;
}

export type PostWebchatMessageResult = { ok: true; messageId: string; aiMode: string } | { ok: false; status: number; error: string };

/** Grava a mensagem do visitante e devolve se a conversa está com a IA ligada (para o chamador disparar a resposta). */
export async function postWebchatMessage(admin: Db, session: WebchatSession, text: string): Promise<PostWebchatMessageResult> {
  if ((await recentInboundCount(admin, session.conversationId)) >= RATE_MAX_MESSAGES) {
    return { ok: false, status: 429, error: 'Muitas mensagens em pouco tempo. Aguarde um instante.' };
  }
  const nowIso = new Date().toISOString();
  const inserted = await admin.from('messages').insert({
    organization_id: session.organizationId,
    conversation_id: session.conversationId,
    direction: 'inbound',
    message_type: 'text',
    body: text,
    delivery_status: 'received',
    provider: 'webchat',
    sent_at: nowIso,
    payload: { source: 'webchat' },
  }).select('id').single();
  if (inserted.error || !inserted.data) return { ok: false, status: 500, error: 'Não foi possível enviar a mensagem.' };

  await admin.from('conversations').update({ last_message_at: nowIso, unread_count: 1 }).eq('id', session.conversationId);
  await admin.from('webchat_sessions').update({ last_seen_at: nowIso }).eq('conversation_id', session.conversationId);
  await admin.from('contacts').update({ last_interaction_at: nowIso }).eq('id', session.contactId);

  return { ok: true, messageId: (inserted.data as { id: string }).id, aiMode: session.aiMode };
}

export type WebchatMessageView = { id: string; direction: string; body: string | null; createdAt: string; status: string; mediaUrl: string | null; filename: string | null; senderName?: string | null };

/** Nome de quem respondeu (agente de IA ou atendente), mostrado acima da mensagem no chat do site. */
function senderNameOf(payload: Record<string, unknown> | null): string | null {
  const sender = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).sender : null;
  const name = sender && typeof sender === 'object' && !Array.isArray(sender) ? (sender as Record<string, unknown>).name : null;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null;
}

/** Mensagens da conversa a partir de um instante, com link temporário para qualquer arquivo enviado pela equipe. */
export async function listWebchatMessagesSince(admin: Db, conversationId: string, after: string | null): Promise<WebchatMessageView[]> {
  let query = admin.from('messages').select('id,direction,body,created_at,delivery_status,payload')
    .eq('conversation_id', conversationId).neq('direction', 'internal').order('created_at', { ascending: true }).limit(100);
  if (after) query = query.gt('created_at', after);
  const { data } = await query;
  const rows = (data ?? []) as Array<{ id: string; direction: string; body: string | null; created_at: string; delivery_status: string; payload: Record<string, unknown> | null }>;

  return Promise.all(rows.map(async row => {
    const media = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>).media : null;
    const path = media && typeof media === 'object' && !Array.isArray(media) ? (media as Record<string, unknown>).path : null;
    const filename = media && typeof media === 'object' && !Array.isArray(media) ? (media as Record<string, unknown>).filename : null;
    let mediaUrl: string | null = null;
    if (typeof path === 'string') {
      const signed = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, 600);
      mediaUrl = signed.data?.signedUrl ?? null;
    }
    return {
      id: row.id, direction: row.direction, body: row.body, createdAt: row.created_at, status: row.delivery_status, mediaUrl,
      filename: typeof filename === 'string' ? filename : null,
      ...(row.direction === 'outbound' ? { senderName: senderNameOf(row.payload) } : {}),
    };
  }));
}

// ---------- Botões do chat e fila de atendimento ----------

/** Configuração do chat do site da empresa (botões, fila, mensagem de encerramento). */
export async function loadWebchatSettings(admin: Db, organizationId: string): Promise<WebchatSettings> {
  const { data } = await admin.from('webchat_widgets').select('settings').eq('organization_id', organizationId).maybeSingle();
  return normalizeWebchatSettings((data as { settings?: unknown } | null)?.settings);
}

/** Andamento do atendimento para o visitante: IA, fila (com posição), atendente ou encerrado. */
export async function loadWebchatState(admin: Db, session: WebchatSession, now: Date = new Date()): Promise<WebchatState | null> {
  const [conversationResult, settings, profileResult] = await Promise.all([
    admin.from('conversations').select('status,ai_mode,assigned_to,handoff_at').eq('id', session.conversationId).maybeSingle(),
    loadWebchatSettings(admin, session.organizationId),
    admin.from('ai_business_profiles').select('business_hours,timezone').eq('organization_id', session.organizationId).maybeSingle(),
  ]);
  const conversation = conversationResult.data as { status: string; ai_mode: string | null; assigned_to: string | null; handoff_at: string | null } | null;
  if (!conversation) return null;
  const profile = profileResult.data as { business_hours?: unknown; timezone?: string } | null;
  const hours = normalizeBusinessHours(profile?.business_hours);
  const zone = profile?.timezone || 'America/Fortaleza';

  let position: number | null = null;
  if (conversation.ai_mode === 'handoff' && !conversation.assigned_to && conversation.status !== 'closed' && conversation.handoff_at) {
    const { count } = await admin.from('conversations').select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId).eq('ai_mode', 'handoff').is('assigned_to', null).neq('status', 'closed')
      .lt('handoff_at', conversation.handoff_at);
    position = typeof count === 'number' ? count + 1 : null;
  }
  return webchatState({ conversation, settings, position, inHours: isWithinBusinessHours(hours, zone, now), hoursText: describeBusinessHours(hours) });
}

async function internalNote(admin: Db, session: WebchatSession, body: string) {
  await admin.from('messages').insert({
    organization_id: session.organizationId, conversation_id: session.conversationId, direction: 'internal',
    message_type: 'text', body, delivery_status: 'sent', provider: 'webchat', sent_at: new Date().toISOString(), payload: { source: 'webchat', event: 'visitor_action' },
  });
}

export type WebchatActionResult = { ok: true } | { ok: false; status: number; error: string };

/** Botão "Falar com atendente": tira a IA da conversa e coloca na fila da equipe. */
export async function requestWebchatHuman(admin: Db, session: WebchatSession): Promise<WebchatActionResult> {
  const settings = await loadWebchatSettings(admin, session.organizationId);
  if (!canRequestHuman(settings)) return { ok: false, status: 403, error: 'Opção indisponível.' };
  const { data } = await admin.from('conversations').select('status,ai_mode,assigned_to').eq('id', session.conversationId).maybeSingle();
  const conversation = data as { status: string; ai_mode: string | null; assigned_to: string | null } | null;
  if (!conversation || conversation.status === 'closed') return { ok: false, status: 409, error: 'Este atendimento já foi encerrado.' };
  if (conversation.assigned_to || conversation.ai_mode === 'handoff') return { ok: true }; // já está com a equipe ou na fila
  const update = await admin.from('conversations').update({ ai_mode: 'handoff', unread_count: 1, last_message_at: new Date().toISOString() }).eq('id', session.conversationId);
  if (update.error) return { ok: false, status: 500, error: 'Não foi possível chamar um atendente.' };
  await internalNote(admin, session, 'O visitante pediu para falar com um atendente pelo botão do chat do site.');
  return { ok: true };
}

/** Botão "Encerrar atendimento": fecha a conversa e invalida a sessão (a próxima mensagem abre outra). */
export async function endWebchat(admin: Db, session: WebchatSession): Promise<WebchatActionResult> {
  const settings = await loadWebchatSettings(admin, session.organizationId);
  if (!settings.endButton.enabled) return { ok: false, status: 403, error: 'Opção indisponível.' };
  const nowIso = new Date().toISOString();
  const update = await admin.from('conversations').update({ status: 'closed', closed_at: nowIso, unread_count: 0 }).eq('id', session.conversationId);
  if (update.error) return { ok: false, status: 500, error: 'Não foi possível encerrar o atendimento.' };
  await internalNote(admin, session, 'O visitante encerrou o atendimento pelo chat do site.');
  await admin.from('webchat_sessions').update({ expires_at: nowIso }).eq('conversation_id', session.conversationId);
  return { ok: true };
}
