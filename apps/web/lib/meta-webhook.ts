import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetaChannel, MetaMessageEvent } from './meta';

/**
 * Processamento dos webhooks da Meta (Instagram/Messenger) no servidor.
 * Mesmo molde do webhook da D-API (lib/dapi-webhook.ts): acha a conexão pelo id da página,
 * garante contato e conversa, grava a mensagem uma única vez (idempotência por mid).
 *
 * Diferença do WhatsApp: a pessoa não tem telefone aqui, só um ID da plataforma (contacts.external_id).
 * A resposta automática da IA ainda não roda nestes dois canais (só WhatsApp e Webchat por enquanto).
 */

type Db = SupabaseClient<any, any, any>;

export type MetaProcessResult = { handled: boolean; reason?: string };

async function findMetaConnection(db: Db, channel: MetaChannel, pageId: string) {
  const { data } = await db.from('channel_connections').select('id,organization_id,display_name').eq('channel', channel).eq('provider_account_id', pageId).maybeSingle();
  return data as { id: string; organization_id: string; display_name: string } | null;
}

async function ensureMetaContact(db: Db, organizationId: string, channel: MetaChannel, senderId: string): Promise<string> {
  const externalId = `${channel}:${senderId}`;
  const existing = await db.from('contacts').select('id').eq('organization_id', organizationId).eq('external_id', externalId).maybeSingle();
  if (existing.data) return (existing.data as { id: string }).id;
  const placeholderName = channel === 'instagram' ? 'Contato do Instagram' : 'Contato do Messenger';
  const inserted = await db.from('contacts').insert({ organization_id: organizationId, full_name: placeholderName, external_id: externalId }).select('id').single();
  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === '23505') {
      const again = await db.from('contacts').select('id').eq('organization_id', organizationId).eq('external_id', externalId).maybeSingle();
      if (again.data) return (again.data as { id: string }).id;
    }
    throw new Error(`contacts.insert: ${inserted.error?.message ?? 'sem retorno'}`);
  }
  return (inserted.data as { id: string }).id;
}

async function ensureMetaConversation(db: Db, organizationId: string, contactId: string, channel: MetaChannel, nowIso: string): Promise<{ id: string; unread_count: number }> {
  const existing = await db.from('conversations').select('id,unread_count').eq('organization_id', organizationId).eq('contact_id', contactId).eq('channel', channel).neq('status', 'closed').order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (existing.data) return existing.data as { id: string; unread_count: number };
  // ai_mode fica sempre 'off': a resposta automática ainda não entrega por este canal.
  const created = await db.from('conversations').insert({ organization_id: organizationId, contact_id: contactId, channel, status: 'open', unread_count: 0, last_message_at: nowIso, ai_mode: 'off' }).select('id,unread_count').single();
  if (created.error || !created.data) throw new Error(`conversations.insert: ${created.error?.message ?? 'sem retorno'}`);
  return created.data as { id: string; unread_count: number };
}

/** Processa um evento (já extraído do corpo do webhook por parseMetaWebhookBody). */
export async function processMetaEvent(db: Db, channel: MetaChannel, event: MetaMessageEvent): Promise<MetaProcessResult> {
  const connection = await findMetaConnection(db, channel, event.pageId);
  if (!connection) return { handled: false, reason: 'connection_not_found' };

  const already = await db.from('messages').select('id').eq('provider', channel).eq('provider_message_id', event.mid).limit(1).maybeSingle();
  if (already.data) return { handled: true, reason: 'duplicate' };

  const contactId = await ensureMetaContact(db, connection.organization_id, channel, event.senderId);
  const conversation = await ensureMetaConversation(db, connection.organization_id, contactId, channel, event.timestamp);

  const inserted = await db.from('messages').upsert({
    organization_id: connection.organization_id,
    conversation_id: conversation.id,
    direction: 'inbound',
    message_type: event.kind === 'text' ? 'text' : 'text', // anexos chegam como aviso em texto nesta etapa.
    body: event.text,
    delivery_status: 'received',
    provider: channel,
    provider_message_id: event.mid,
    sent_at: event.timestamp,
    payload: { source: channel, original_kind: event.kind },
  }, { onConflict: 'provider,provider_message_id', ignoreDuplicates: true }).select('id');
  if (inserted.error) throw new Error(`messages.insert: ${inserted.error.message}`);
  if (!inserted.data || inserted.data.length === 0) return { handled: true, reason: 'duplicate' };

  await db.from('conversations').update({ last_message_at: event.timestamp, unread_count: (conversation.unread_count ?? 0) + 1 }).eq('id', conversation.id);
  await db.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contactId);

  return { handled: true };
}
