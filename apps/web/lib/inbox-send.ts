import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_CAPTION_LENGTH, buildDapiMediaRequest, validateAttachment } from './inbox-attachments';
import { humanSigner, normalizeSignature, signText } from './signature';

/**
 * Envio de resposta do Inbox pelo WhatsApp (D-API, Fase 4).
 *
 * Fluxo: valida a conversa (as regras de acesso do Supabase garantem que o usuário
 * só enxerga conversas do próprio workspace) -> grava a mensagem como "queued" ->
 * chama a D-API -> marca "sent" (ou "failed" com o motivo) e atualiza a conversa.
 *
 * `db` (cliente do usuário) só LÊ. `writeDb` grava: a regra de acesso de messages permite
 * UPDATE só para owner/admin/manager, então um atendente comum não conseguiria marcar a
 * mensagem como enviada. A leitura com o cliente do usuário já prova que ele tem acesso.
 *
 * Identificação de quem enviou: payload.sender = { type: 'human' | 'ai' | 'phone', name }.
 * Quando o atendente envia, a conversa sai do modo IA (ai_mode = 'off'): o humano assumiu.
 * Assinatura: o texto que vai ao WhatsApp ganha o nome do atendente em negrito ("*Ana:*"), conforme a
 * configuração do workspace (channel_connections.settings.signature). No Inbox o texto fica sem o prefixo.
 *
 * Anexos: o arquivo já está no Storage (enviado pelo navegador). Aqui validamos o caminho,
 * geramos um link temporário assinado (`signUrl`) e pedimos à D-API que envie a mídia.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, unknown>;

export type SendInput = { userId: string; senderName?: string | null; conversationId: string; text: string; attachment?: unknown };
export type SendOutcome = { status: number; body: Json };
/** Faz o POST na D-API (ex.: path "/messages/send/text") e devolve o JSON da resposta. */
export type SendFn = (path: string, body: Json, options?: { timeoutMs?: number }) => Promise<unknown>;
/** Gera um link temporário para a D-API baixar o arquivo do Storage. Retorna null se o arquivo não existir. */
export type SignFn = (path: string) => Promise<string | null>;

export const MAX_TEXT_LENGTH = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Canais em que o Inbox já consegue enviar a resposta do atendente. Instagram/Messenger ainda não. */
const SENDABLE_CHANNELS = ['whatsapp', 'webchat'];

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/** A resposta de envio da D-API não é documentada em detalhe: procura o id da mensagem nos formatos mais comuns. */
export function pickProviderMessageId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const candidates: Json[] = [payload];
  for (const key of ['data', 'message', 'result']) {
    const nested = payload[key];
    if (isRecord(nested)) candidates.push(nested);
  }
  for (const candidate of candidates) {
    for (const key of ['messageId', 'message_id', 'id']) {
      const found = asString(candidate[key]);
      if (found) return found;
    }
    if (isRecord(candidate.key)) {
      const found = asString(candidate.key.id);
      if (found) return found;
    }
  }
  return null;
}

export function friendlySendError(message: string): string {
  if (/session not found/i.test(message)) {
    return 'A sessão do WhatsApp não foi encontrada na D-API. Reconecte o WhatsApp em Chatbots.';
  }
  if (/not connected|disconnected|logged out/i.test(message)) {
    return 'O WhatsApp está desconectado. Reconecte o número em Chatbots.';
  }
  return `A D-API não conseguiu enviar a mensagem: ${message.slice(0, 200)}`;
}

const fail = (status: number, error: string): SendOutcome => ({ status, body: { success: false, error } });

export async function sendWhatsappText(db: Db, input: SendInput, send: SendFn, writeDb: Db = db, signUrl?: SignFn): Promise<SendOutcome> {
  const text = input.text.trim();
  const hasAttachment = input.attachment !== undefined && input.attachment !== null;
  if (!UUID_RE.test(input.conversationId)) return fail(400, 'Conversa inválida.');
  if (!hasAttachment && !text) return fail(400, 'Escreva uma mensagem antes de enviar.');
  if (text.length > (hasAttachment ? MAX_CAPTION_LENGTH : MAX_TEXT_LENGTH)) {
    return fail(400, `${hasAttachment ? 'A legenda' : 'A mensagem'} passa do limite de ${hasAttachment ? MAX_CAPTION_LENGTH : MAX_TEXT_LENGTH} caracteres.`);
  }

  const conversationResult = await db
    .from('conversations')
    .select('id,organization_id,channel,contacts(phone_e164),teams(name)')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (conversationResult.error) return fail(500, 'Não foi possível consultar a conversa.');
  const conversation = conversationResult.data as {
    id: string;
    organization_id: string;
    channel: string;
    contacts: { phone_e164: string | null } | Array<{ phone_e164: string | null }> | null;
    teams?: { name: string } | Array<{ name: string }> | null;
  } | null;
  if (!conversation) return fail(404, 'Conversa não encontrada.');
  if (!SENDABLE_CHANNELS.includes(conversation.channel)) return fail(422, 'Este canal ainda não está disponível para envio.');
  const isWebchat = conversation.channel === 'webchat';

  // WhatsApp precisa de telefone e de uma conexão ativa; Webchat não (a conversa já existe no banco).
  let phone = '';
  let connection: { provider_account_id: string | null; status: string; settings?: unknown } | null = null;
  if (!isWebchat) {
    const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
    phone = (contact?.phone_e164 ?? '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) return fail(422, 'O contato não tem um número de WhatsApp válido.');

    const connectionResult = await db
      .from('channel_connections')
      .select('provider_account_id,status,settings')
      .eq('organization_id', conversation.organization_id)
      .eq('channel', 'whatsapp')
      .maybeSingle();
    if (connectionResult.error) return fail(500, 'Não foi possível consultar a conexão do WhatsApp.');
    connection = connectionResult.data as { provider_account_id: string | null; status: string; settings?: unknown } | null;
    if (!connection?.provider_account_id || connection.status !== 'connected') {
      return fail(409, 'O WhatsApp deste workspace não está conectado. Conecte o número em Chatbots.');
    }
  }

  // Anexo: valida o caminho (precisa estar na pasta desta empresa e conversa) e gera o link temporário
  // (só para o WhatsApp: é o endereço de onde a D-API baixa o arquivo. O Webchat lê direto do Storage.)
  let attachment: ReturnType<typeof validateAttachment> | null = null;
  let mediaUrl: string | null = null;
  if (hasAttachment) {
    attachment = validateAttachment(input.attachment, conversation.organization_id, conversation.id);
    if (!attachment.ok) return fail(400, attachment.error);
    if (attachment.value.kind === 'audio' && text) return fail(400, 'Áudio não aceita legenda. Envie o texto em outra mensagem.');
    if (!isWebchat) {
      if (!signUrl) return fail(500, 'Envio de anexos não está configurado no servidor.');
      mediaUrl = await signUrl(attachment.value.path).catch(() => null);
      if (!mediaUrl) return fail(400, 'O arquivo não foi encontrado no armazenamento. Anexe novamente.');
    }
  }
  const media = attachment?.ok ? attachment.value : null;

  // 1) Registra a mensagem como "queued" para ela aparecer na hora no Inbox.
  const now = new Date().toISOString();
  const senderName = asString(input.senderName) ?? 'Atendente';
  const signature = isWebchat ? null : normalizeSignature(connection?.settings);
  const team = Array.isArray(conversation.teams) ? conversation.teams[0] : conversation.teams;
  const signer = signature?.enabled ? humanSigner({ name: senderName, team: team?.name, format: signature.format }) : '';
  // Texto e legenda que vão ao WhatsApp (áudio não tem legenda, então não leva assinatura). O Webchat
  // não leva assinatura no texto: quem está respondendo já aparece identificado na própria tela.
  const outgoing = !isWebchat && text ? signText(text, signer) : text;
  const basePayload = {
    source: 'inbox',
    sender: { type: 'human', name: senderName, user_id: input.userId },
    ...(signer && text ? { signature: signer } : {}),
    ...(media ? { media: { path: media.path, mimetype: media.mimetype, filename: media.filename, size: media.size, voice: media.voice === true } } : {}),
  };
  const inserted = await writeDb
    .from('messages')
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      direction: 'outbound',
      message_type: media ? media.kind : 'text',
      body: text || null,
      delivery_status: 'queued',
      sender_id: input.userId,
      provider: isWebchat ? 'webchat' : 'd-api',
      sent_at: now,
      payload: basePayload,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) return fail(500, 'Não foi possível registrar a mensagem.');
  const messageRowId = (inserted.data as { id: string }).id;

  // 2) Entrega. Webchat só marca como enviado: quem lê é o navegador do visitante, pela
  // rota /api/webchat/messages, não há provedor externo para chamar.
  if (isWebchat) {
    await writeDb.from('messages').update({ delivery_status: 'sent', sent_at: new Date().toISOString() }).eq('id', messageRowId);
    await writeDb
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open', ai_mode: 'off' })
      .eq('id', conversation.id);
    return { status: 200, body: { success: true, messageId: messageRowId, delivery_status: 'sent' } };
  }

  const providerAccountId = connection!.provider_account_id as string;
  try {
    const request = media && mediaUrl
      ? buildDapiMediaRequest(media, { sessionId: providerAccountId, to: phone, url: mediaUrl, caption: outgoing || null })
      : { path: '/messages/send/text', body: { sessionId: providerAccountId, to: phone, text: outgoing } };
    // Mídia pode demorar mais que texto (a D-API baixa e reenvia o arquivo).
    const response = await send(request.path, request.body, media ? { timeoutMs: 55_000 } : undefined);
    const providerMessageId = pickProviderMessageId(response);
    const sentPatch = {
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      payload: { ...basePayload, provider_response_keys: isRecord(response) ? Object.keys(response) : [] },
    };

    let update = await writeDb
      .from('messages')
      .update(providerMessageId ? { ...sentPatch, provider_message_id: providerMessageId } : sentPatch)
      .eq('id', messageRowId);
    if (update.error && providerMessageId) {
      // Ex.: o id já existe em outra linha. Mantém a mensagem como enviada, sem o id.
      update = await writeDb.from('messages').update(sentPatch).eq('id', messageRowId);
    }
    // Atendente respondeu: assume a conversa e a IA para de responder (pode ser religada no Inbox).
    await writeDb
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open', ai_mode: 'off' })
      .eq('id', conversation.id);

    return {
      status: 200,
      body: { success: true, messageId: messageRowId, delivery_status: 'sent', providerMessageId },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'erro desconhecido';
    await writeDb
      .from('messages')
      .update({ delivery_status: 'failed', payload: { ...basePayload, error: reason.slice(0, 300) } })
      .eq('id', messageRowId);
    return { status: 502, body: { success: false, error: friendlySendError(reason), messageId: messageRowId } };
  }
}
