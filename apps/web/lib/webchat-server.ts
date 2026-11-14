import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_BUCKET } from './inbox-attachments';
import { initialAiMode } from './dapi-webhook';
import { WEBCHAT_SESSION_DAYS } from './webchat';

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

export type WebchatWidget = { id: string; organization_id: string; is_enabled: boolean; display_name: string; greeting_message: string; color: string };

/** Cria o contato, a conversa e a sessão de um novo visitante do widget. */
export async function startWebchatSession(admin: Db, widget: WebchatWidget): Promise<{ token: string; conversationId: string }> {
  const nowIso = new Date().toISOString();
  const contact = await admin.from('contacts')
    .insert({ organization_id: widget.organization_id, full_name: 'Visitante do site' })
    .select('id').single();
  if (contact.error || !contact.data) throw new Error(`Não foi possível iniciar a conversa: ${contact.error?.message ?? 'sem retorno'}`);
  const contactId = (contact.data as { id: string }).id;

  const conversation = await admin.from('conversations')
    .insert({
      organization_id: widget.organization_id, contact_id: contactId, channel: 'webchat', status: 'open',
      unread_count: 0, last_message_at: nowIso, ai_mode: await initialAiMode(admin, widget.organization_id),
    })
    .select('id').single();
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

export type WebchatMessageView = { id: string; direction: string; body: string | null; createdAt: string; status: string; mediaUrl: string | null; filename: string | null };

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
    return { id: row.id, direction: row.direction, body: row.body, createdAt: row.created_at, status: row.delivery_status, mediaUrl, filename: typeof filename === 'string' ? filename : null };
  }));
}
