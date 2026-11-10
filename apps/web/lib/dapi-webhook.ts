import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Processamento dos webhooks da D-API (Fase 3).
 *
 * Eventos tratados:
 * - messages.received: grava contato, conversa e mensagem no Inbox.
 * - connection.status: atualiza o status da conexão do WhatsApp.
 * Os demais eventos são reconhecidos (HTTP 200) e ignorados por enquanto.
 *
 * Idempotência: messages tem UNIQUE (provider, provider_message_id), então um
 * evento repetido pela D-API nunca cria mensagem duplicada.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, unknown>;

export type DapiEnvelope = {
  event: string;
  sessionId: string;
  traceId: string | null;
  data: Json;
};

export type ProcessResult = { handled: boolean; reason?: string };

export const DAPI_PROVIDER = 'd-api';
const HISTORY_WINDOW_MS = 10 * 60 * 1000;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null };

function must<T>(result: DbResult<T>, label: string): T | null {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

/** "5511999999999@s.whatsapp.net" -> "+5511999999999". Retorna null para @lid ou JIDs inválidos. */
export function jidToPhone(jid: unknown): string | null {
  const raw = asString(jid);
  if (!raw) return null;
  const parts = raw.split('@');
  const user = parts[0] ?? '';
  const server = parts[1] ?? '';
  if (server !== 's.whatsapp.net' && server !== 'c.us') return null;
  const digits = (user.split(':')[0] ?? '').replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}

const MESSAGE_TYPE_MAP: Record<string, string> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  ptt: 'audio',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
  list_response: 'interactive',
  template_button_reply: 'interactive',
  buttons_response: 'interactive',
};

/** Tipos aceitos pela tabela messages: text, image, audio, video, document, location, sticker, interactive, system. */
export function mapMessageType(type: string): string {
  return MESSAGE_TYPE_MAP[type] ?? 'text';
}

export function parseTimestamp(value: unknown): string {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(n) && n > 0) {
    const ms = n < 1e12 ? n * 1000 : n; // aceita segundos ou milissegundos
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function extractBody(type: string, data: Json): string | null {
  const nested = isRecord(data.data) ? data.data : {};
  const media = isRecord(data.media_data) ? data.media_data : {};
  if (type === 'list_response') return asString(nested.selected_title) ?? asString(data.message);
  if (type === 'template_button_reply') return asString(nested.selected_display_text) ?? asString(data.message);
  const text = asString(data.message) ?? asString(media.caption);
  if (text) return text;
  return mapMessageType(type) === 'text' && type !== 'text' ? `[${type}]` : null;
}

async function findConnection(db: Db, sessionId: string) {
  const result = await db
    .from('channel_connections')
    .select('id,organization_id,settings,status')
    .eq('channel', 'whatsapp')
    .eq('provider_account_id', sessionId)
    .limit(1)
    .maybeSingle();
  return must<{ id: string; organization_id: string; settings: Json | null; status: string }>(result, 'channel_connections');
}

async function ensureContact(db: Db, organizationId: string, phone: string, name: string | null): Promise<string> {
  const lookup = () =>
    db
      .from('contacts')
      .select('id,full_name')
      .eq('organization_id', organizationId)
      .eq('phone_e164', phone)
      .maybeSingle();

  const existing = must<{ id: string; full_name: string }>(await lookup(), 'contacts.select');
  if (existing) {
    // Só troca o nome se o contato ainda estiver com o número como nome provisório.
    if (name && name !== phone && existing.full_name === phone) {
      must(await db.from('contacts').update({ full_name: name }).eq('id', existing.id), 'contacts.update');
    }
    return existing.id;
  }

  const inserted = await db
    .from('contacts')
    .insert({ organization_id: organizationId, full_name: name ?? phone, phone_e164: phone })
    .select('id')
    .single();
  if (inserted.error) {
    // Corrida entre dois eventos simultâneos: o outro já criou o contato.
    if (inserted.error.code === '23505') {
      const again = must<{ id: string }>(await lookup(), 'contacts.reselect');
      if (again) return again.id;
    }
    throw new Error(`contacts.insert: ${inserted.error.message}`);
  }
  return (inserted.data as { id: string }).id;
}

type ConversationRow = { id: string; status: string; unread_count: number; last_message_at: string | null };

async function ensureConversation(db: Db, organizationId: string, contactId: string, nowIso: string): Promise<ConversationRow> {
  const existing = must<ConversationRow>(
    await db
      .from('conversations')
      .select('id,status,unread_count,last_message_at')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .eq('channel', 'whatsapp')
      .neq('status', 'closed')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    'conversations.select',
  );
  if (existing) return existing;

  const created = must<ConversationRow>(
    await db
      .from('conversations')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        channel: 'whatsapp',
        status: 'open',
        unread_count: 0,
        last_message_at: nowIso,
      })
      .select('id,status,unread_count,last_message_at')
      .single(),
    'conversations.insert',
  );
  if (!created) throw new Error('conversations.insert: sem retorno');
  return created;
}

async function handleMessageReceived(
  db: Db,
  connection: { organization_id: string },
  envelope: DapiEnvelope,
): Promise<ProcessResult> {
  const { data, sessionId, traceId } = envelope;
  const organizationId = connection.organization_id;

  const messageId = asString(data.id);
  if (!messageId) return { handled: false, reason: 'message_without_id' };
  if (data.is_group === true) return { handled: false, reason: 'group_message' };

  const type = asString(data.type) ?? 'text';
  const nested = isRecord(data.data) ? data.data : {};

  // Reação: ainda não é exibida no Inbox.
  if (type === 'reaction') return { handled: false, reason: 'reaction_ignored' };

  // Mensagem editada: atualiza o texto da mensagem original.
  if (type === 'edited_message') {
    const originalId = asString(nested.original_message_id);
    const newBody = asString(data.message);
    if (!originalId || !newBody) return { handled: false, reason: 'edit_without_target' };
    must(
      await db
        .from('messages')
        .update({ body: newBody })
        .eq('organization_id', organizationId)
        .eq('provider', DAPI_PROVIDER)
        .eq('provider_message_id', originalId),
      'messages.edit',
    );
    return { handled: true };
  }

  // fromMe=true: mensagem enviada pelo próprio número em outro aparelho (a outra ponta é "to").
  const fromMe = data.fromMe === true;
  const counterpart = fromMe ? (isRecord(data.to) ? data.to : {}) : (isRecord(data.from) ? data.from : {});
  const phone = jidToPhone(counterpart.jid);
  if (!phone) return { handled: false, reason: 'counterpart_without_phone' };
  const contactName = asString(counterpart.name) ?? (fromMe ? null : asString(data.from_name));

  // Idempotência rápida: se a mensagem já existe, não faz mais nada.
  const already = must<{ id: string }>(
    await db
      .from('messages')
      .select('id')
      .eq('provider', DAPI_PROVIDER)
      .eq('provider_message_id', messageId)
      .limit(1)
      .maybeSingle(),
    'messages.exists',
  );
  if (already) return { handled: true, reason: 'duplicate' };

  const sentAt = parseTimestamp(data.timestamp);
  const nowIso = new Date().toISOString();
  const contactId = await ensureContact(db, organizationId, phone, contactName);
  const conversation = await ensureConversation(db, organizationId, contactId, sentAt);

  const media = isRecord(data.media_data) ? data.media_data : {};
  const context = isRecord(data.context_info) ? data.context_info : {};
  const row = {
    organization_id: organizationId,
    conversation_id: conversation.id,
    direction: fromMe ? 'outbound' : 'inbound',
    message_type: mapMessageType(type),
    body: extractBody(type, data),
    delivery_status: fromMe ? 'sent' : 'received',
    provider: DAPI_PROVIDER,
    provider_message_id: messageId,
    sent_at: sentAt,
    payload: {
      source: DAPI_PROVIDER,
      event: 'messages.received',
      session_id: sessionId,
      trace_id: traceId,
      original_type: type,
      media_url: asString(data.media_url),
      mimetype: asString(media.mimetype),
      filename: asString(media.filename),
      quoted_message_id: asString(context.quoted_message_id),
      data: Object.keys(nested).length > 0 ? nested : null,
    },
  };

  const inserted = await db
    .from('messages')
    .upsert(row, { onConflict: 'provider,provider_message_id', ignoreDuplicates: true })
    .select('id');
  if (inserted.error) throw new Error(`messages.insert: ${inserted.error.message}`);
  if (!inserted.data || inserted.data.length === 0) return { handled: true, reason: 'duplicate' };

  // Atualiza a conversa. Mensagens antigas (sincronização de histórico) não contam como "não lidas".
  const isFresh = Date.now() - Date.parse(sentAt) < HISTORY_WINDOW_MS;
  const patch: Json = {};
  if (!conversation.last_message_at || Date.parse(sentAt) > Date.parse(conversation.last_message_at)) {
    patch.last_message_at = sentAt;
  }
  if (!fromMe && isFresh) {
    patch.unread_count = (conversation.unread_count ?? 0) + 1;
    if (conversation.status === 'snoozed') patch.status = 'open';
  }
  if (Object.keys(patch).length > 0) {
    must(await db.from('conversations').update(patch).eq('id', conversation.id), 'conversations.update');
  }
  if (!fromMe && isFresh) {
    must(await db.from('contacts').update({ last_interaction_at: nowIso }).eq('id', contactId), 'contacts.touch');
  }
  return { handled: true };
}

async function handleConnectionStatus(
  db: Db,
  connection: { id: string; organization_id: string; settings: Json | null },
  envelope: DapiEnvelope,
): Promise<ProcessResult> {
  const raw = (asString(envelope.data.status) ?? '').toLowerCase();
  const nowIso = new Date().toISOString();
  const settings = isRecord(connection.settings) ? connection.settings : {};

  let patch: Json;
  if (raw === 'connected') {
    const rawPhone = asString(envelope.data.phone);
    const phone = rawPhone ? `+${rawPhone.replace(/\D/g, '')}` : null;
    patch = {
      status: 'connected',
      display_name: phone ? `WhatsApp · ${phone}` : 'WhatsApp conectado',
      settings: { ...settings, connected_phone: phone, connected_at: nowIso },
      updated_at: nowIso,
    };
  } else if (raw === 'disconnected' || raw === 'logged_out') {
    patch = {
      status: 'disconnected',
      display_name: 'WhatsApp desconectado',
      settings: { ...settings, disconnect_reason: asString(envelope.data.reason), disconnected_at: nowIso },
      updated_at: nowIso,
    };
  } else {
    return { handled: false, reason: 'status_not_handled' };
  }

  must(
    await db
      .from('channel_connections')
      .update(patch)
      .eq('id', connection.id)
      .eq('organization_id', connection.organization_id),
    'channel_connections.update',
  );
  return { handled: true };
}

export async function processDapiEvent(db: Db, envelope: DapiEnvelope): Promise<ProcessResult> {
  if (envelope.event !== 'messages.received' && envelope.event !== 'connection.status') {
    return { handled: false, reason: 'event_not_handled' };
  }

  const connection = await findConnection(db, envelope.sessionId);
  // Sessão desconhecida: responde 200 (nunca 404/410, senão a D-API para de entregar).
  if (!connection) return { handled: false, reason: 'unknown_session' };

  if (envelope.event === 'connection.status') return handleConnectionStatus(db, connection, envelope);
  return handleMessageReceived(db, connection, envelope);
}
