import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Envio de resposta do Inbox pelo WhatsApp (D-API, Fase 4).
 *
 * Fluxo: valida a conversa (as regras de acesso do Supabase garantem que o usuário
 * só enxerga conversas do próprio workspace) -> grava a mensagem como "queued" ->
 * chama a D-API -> marca "sent" (ou "failed" com o motivo) e atualiza a conversa.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, unknown>;

export type SendInput = { userId: string; conversationId: string; text: string };
export type SendOutcome = { status: number; body: Json };
/** Faz o POST na D-API (ex.: path "/messages/send/text") e devolve o JSON da resposta. */
export type SendFn = (path: string, body: Json) => Promise<unknown>;

export const MAX_TEXT_LENGTH = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function sendWhatsappText(db: Db, input: SendInput, send: SendFn): Promise<SendOutcome> {
  const text = input.text.trim();
  if (!UUID_RE.test(input.conversationId)) return fail(400, 'Conversa inválida.');
  if (!text) return fail(400, 'Escreva uma mensagem antes de enviar.');
  if (text.length > MAX_TEXT_LENGTH) return fail(400, `A mensagem passa do limite de ${MAX_TEXT_LENGTH} caracteres.`);

  const conversationResult = await db
    .from('conversations')
    .select('id,organization_id,channel,contacts(phone_e164)')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (conversationResult.error) return fail(500, 'Não foi possível consultar a conversa.');
  const conversation = conversationResult.data as {
    id: string;
    organization_id: string;
    channel: string;
    contacts: { phone_e164: string | null } | Array<{ phone_e164: string | null }> | null;
  } | null;
  if (!conversation) return fail(404, 'Conversa não encontrada.');
  if (conversation.channel !== 'whatsapp') return fail(422, 'Esta conversa não é do WhatsApp.');

  const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
  const phone = (contact?.phone_e164 ?? '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(phone)) return fail(422, 'O contato não tem um número de WhatsApp válido.');

  const connectionResult = await db
    .from('channel_connections')
    .select('provider_account_id,status')
    .eq('organization_id', conversation.organization_id)
    .eq('channel', 'whatsapp')
    .maybeSingle();
  if (connectionResult.error) return fail(500, 'Não foi possível consultar a conexão do WhatsApp.');
  const connection = connectionResult.data as { provider_account_id: string | null; status: string } | null;
  if (!connection?.provider_account_id || connection.status !== 'connected') {
    return fail(409, 'O WhatsApp deste workspace não está conectado. Conecte o número em Chatbots.');
  }

  // 1) Registra a mensagem como "queued" para ela aparecer na hora no Inbox.
  const now = new Date().toISOString();
  const inserted = await db
    .from('messages')
    .insert({
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      direction: 'outbound',
      message_type: 'text',
      body: text,
      delivery_status: 'queued',
      sender_id: input.userId,
      provider: 'd-api',
      sent_at: now,
      payload: { source: 'inbox' },
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) return fail(500, 'Não foi possível registrar a mensagem.');
  const messageRowId = (inserted.data as { id: string }).id;

  // 2) Envia pela D-API.
  try {
    const response = await send('/messages/send/text', {
      sessionId: connection.provider_account_id,
      to: phone,
      text,
    });
    const providerMessageId = pickProviderMessageId(response);
    const sentPatch = {
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      payload: { source: 'inbox', provider_response_keys: isRecord(response) ? Object.keys(response) : [] },
    };

    let update = await db
      .from('messages')
      .update(providerMessageId ? { ...sentPatch, provider_message_id: providerMessageId } : sentPatch)
      .eq('id', messageRowId);
    if (update.error && providerMessageId) {
      // Ex.: o id já existe em outra linha. Mantém a mensagem como enviada, sem o id.
      update = await db.from('messages').update(sentPatch).eq('id', messageRowId);
    }
    await db
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', conversation.id);

    return {
      status: 200,
      body: { success: true, messageId: messageRowId, delivery_status: 'sent', providerMessageId },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'erro desconhecido';
    await db
      .from('messages')
      .update({ delivery_status: 'failed', payload: { source: 'inbox', error: reason.slice(0, 300) } })
      .eq('id', messageRowId);
    return { status: 502, body: { success: false, error: friendlySendError(reason), messageId: messageRowId } };
  }
}
