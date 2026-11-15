import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetaChannel, MetaMessageEvent } from './meta';
import { channelSupportsAi } from './ai-agent';
import { initialAiMode } from './dapi-webhook';

/**
 * Processamento dos webhooks da Meta (Instagram/Messenger) no servidor.
 * Mesmo molde do webhook da D-API (lib/dapi-webhook.ts): acha a conexão pelo id da página,
 * garante contato e conversa, grava a mensagem uma única vez (idempotência por mid).
 *
 * Diferença do WhatsApp: a pessoa não tem telefone aqui, só um ID da plataforma (contacts.external_id).
 * A IA responde no Instagram (a conversa nasce conforme a configuração do agente); o Messenger fica
 * sempre com a equipe (ai_mode 'off').
 */

type Db = SupabaseClient<any, any, any>;

export type MetaProcessResult = {
  handled: boolean;
  reason?: string;
  /** Presente quando a IA deve responder esta mensagem (Instagram com a IA ligada). */
  aiTrigger?: { organizationId: string; conversationId: string; messageId: string };
};
type MetaConversation = { id: string; unread_count: number; ai_mode: string | null };

async function findMetaConnection(db: Db, channel: MetaChannel, pageId: string) {
  const { data } = await db.from('channel_connections').select('id,organization_id,display_name').eq('channel', channel).eq('provider_account_id', pageId).eq('status', 'connected').order('created_at', { ascending: false }).limit(1).maybeSingle();
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

async function ensureMetaConversation(db: Db, organizationId: string, contactId: string, channel: MetaChannel, nowIso: string): Promise<MetaConversation> {
  const lookup = () => db.from('conversations').select('id,unread_count,ai_mode').eq('organization_id', organizationId).eq('contact_id', contactId).eq('channel', channel).neq('status', 'closed').order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  const existing = await lookup();
  if (existing.data) return existing.data as MetaConversation;
  // Instagram segue a configuração do agente (como o WhatsApp); Messenger é sempre só com a equipe.
  const aiMode = channelSupportsAi(channel) ? await initialAiMode(db, organizationId, channel) : 'off';
  const created = await db.from('conversations').insert({ organization_id: organizationId, contact_id: contactId, channel, status: 'open', unread_count: 0, last_message_at: nowIso, ai_mode: aiMode }).select('id,unread_count,ai_mode').single();
  if (created.error?.code === '23505') {
    // Dois eventos simultâneos: o banco aceita uma só conversa aberta por contato; usa a que já existe.
    const again = await lookup();
    if (again.data) return again.data as MetaConversation;
  }
  if (created.error || !created.data) throw new Error(`conversations.insert: ${created.error?.message ?? 'sem retorno'}`);
  return created.data as MetaConversation;
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

  const messageId = (inserted.data[0] as { id?: string } | undefined)?.id;
  if (channelSupportsAi(channel) && conversation.ai_mode === 'on' && messageId) {
    return { handled: true, aiTrigger: { organizationId: connection.organization_id, conversationId: conversation.id, messageId } };
  }
  return { handled: true };
}
