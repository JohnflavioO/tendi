import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureConversation } from './dapi-webhook';
import { connectedSession, sendSystemMessage, type SendFn } from './agenda-reminders-server';

/**
 * Campanhas de marketing: disparo de WhatsApp para um segmento de contatos (hoje, por etiqueta).
 * Sempre pelo servidor (chave de serviço) — o cliente da sessão só cria e acompanha o progresso,
 * nunca envia direto. Mesmo molde de agenda-reminders-server.ts: o agendador do banco chama o
 * processamento em lotes pequenos, com ritmo entre envios, para não arriscar o número da empresa.
 */

type Db = SupabaseClient<any, any, any>;

export const CAMPAIGN_SENDER_NAME = 'Campanha';
const MAX_RECIPIENTS_PER_RUN = 20;
const MAX_CAMPAIGNS_PER_RUN = 5;
/** Intervalo entre envios: mesmo ritmo humano usado nos lembretes, para não arriscar o número. */
const SEND_SPACING_MS = 1_200;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

export type CreateCampaignResult =
  | { ok: true; campaignId: string; totalRecipients: number }
  | { ok: false; status: number; error: string };

/**
 * Cria a campanha e já registra os destinatários: contatos com a etiqueta pedida, telefone
 * cadastrado e **opt-in de WhatsApp confirmado** (nunca manda promoção sem autorização).
 */
export async function createCampaign(db: Db, input: {
  organizationId: string; name: string; message: string; tag: string; createdBy: string | null;
}): Promise<CreateCampaignResult> {
  const name = input.name.trim();
  const message = input.message.trim();
  const tag = input.tag.trim();
  if (!name) return { ok: false, status: 400, error: 'Informe o nome da campanha.' };
  if (!message) return { ok: false, status: 400, error: 'Informe a mensagem.' };
  if (message.length > 1000) return { ok: false, status: 400, error: 'A mensagem pode ter até 1000 caracteres.' };
  if (!tag) return { ok: false, status: 400, error: 'Informe o segmento (etiqueta).' };

  const contacts = await db.from('contacts').select('id,full_name,phone_e164')
    .eq('organization_id', input.organizationId).eq('opt_in', true)
    .contains('tags', [tag]).not('phone_e164', 'is', null);
  if (contacts.error) return { ok: false, status: 500, error: `Não foi possível buscar os contatos: ${contacts.error.message}` };
  const recipients = (contacts.data ?? []) as Array<{ id: string; full_name: string; phone_e164: string }>;
  if (!recipients.length) return { ok: false, status: 422, error: 'Nenhum contato desse segmento tem opt-in de WhatsApp confirmado ainda.' };

  const inserted = await db.from('campaigns').insert({
    organization_id: input.organizationId, name, message, tag, status: 'sending',
    total_recipients: recipients.length, created_by: input.createdBy,
  }).select('id').single();
  if (inserted.error || !inserted.data) return { ok: false, status: 500, error: `Não foi possível criar a campanha: ${inserted.error?.message ?? 'sem retorno'}` };
  const campaignId = (inserted.data as { id: string }).id;

  const rows = recipients.map(contact => ({
    campaign_id: campaignId, organization_id: input.organizationId, contact_id: contact.id,
    customer_name: contact.full_name, phone: contact.phone_e164, status: 'pending',
  }));
  const insertedRecipients = await db.from('campaign_recipients').insert(rows);
  if (insertedRecipients.error) {
    await db.from('campaigns').delete().eq('id', campaignId);
    return { ok: false, status: 500, error: `Não foi possível registrar os destinatários: ${insertedRecipients.error.message}` };
  }
  return { ok: true, campaignId, totalRecipients: recipients.length };
}

type PendingRecipient = { id: string; campaign_id: string; contact_id: string; customer_name: string; phone: string };
type SendingCampaign = { id: string; organization_id: string; message: string };

export type CampaignRunResult = { campaigns: number; sent: number; failed: number; completed: number };

/** Uma execução do agendador: envia o próximo lote pendente de cada campanha em andamento. */
export async function runCampaignBatch(db: Db, deps: { send: SendFn; sleep?: (ms: number) => Promise<void> }): Promise<CampaignRunResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const result: CampaignRunResult = { campaigns: 0, sent: 0, failed: 0, completed: 0 };

  const campaignRows = await db.from('campaigns').select('id,organization_id,message')
    .eq('status', 'sending').limit(MAX_CAMPAIGNS_PER_RUN);
  if (campaignRows.error) throw new Error(`campaigns: ${campaignRows.error.message}`);

  for (const campaign of (campaignRows.data ?? []) as SendingCampaign[]) {
    result.campaigns += 1;
    const sessionId = await connectedSession(db, campaign.organization_id);
    if (!sessionId) continue; // Sem WhatsApp conectado: tenta de novo na próxima execução.

    const pendingRows = await db.from('campaign_recipients').select('id,campaign_id,contact_id,customer_name,phone')
      .eq('campaign_id', campaign.id).eq('status', 'pending').limit(MAX_RECIPIENTS_PER_RUN);
    if (pendingRows.error) continue;
    const pending = (pendingRows.data ?? []) as PendingRecipient[];

    for (const recipient of pending) {
      // Reserva o destinatário: só quem conseguir tirá-lo de "pending" primeiro processa.
      const claim = await db.from('campaign_recipients').update({ status: 'sending' })
        .eq('id', recipient.id).eq('status', 'pending').select('id');
      if (claim.error || !Array.isArray(claim.data) || claim.data.length === 0) continue;

      const firstName = recipient.customer_name.trim().split(/\s+/)[0] || recipient.customer_name;
      const text = campaign.message.replace(/\{nome\}/g, firstName);
      let outcome: { ok: true } | { ok: false; error: string };
      try {
        const conversation = await ensureConversation(db, campaign.organization_id, recipient.contact_id, new Date().toISOString());
        outcome = await sendSystemMessage(db, {
          organizationId: campaign.organization_id, sessionId, conversationId: conversation.id, phone: recipient.phone, text,
          kind: 'campaign', senderName: CAMPAIGN_SENDER_NAME,
        }, deps.send);
      } catch (error) {
        outcome = { ok: false, error: errorText(error) };
      }

      if (outcome.ok) {
        await db.from('campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', recipient.id);
        result.sent += 1;
        await db.from('campaigns').update({ sent_count: await bumpCount(db, campaign.id, 'sent_count') }).eq('id', campaign.id);
      } else {
        await db.from('campaign_recipients').update({ status: 'failed', error: outcome.error }).eq('id', recipient.id);
        result.failed += 1;
        await db.from('campaigns').update({ failed_count: await bumpCount(db, campaign.id, 'failed_count') }).eq('id', campaign.id);
      }
      await sleep(SEND_SPACING_MS);
    }

    const remaining = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id).eq('status', 'pending');
    if (!remaining.error && (remaining.count ?? 0) === 0) {
      await db.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaign.id);
      result.completed += 1;
    }
  }
  return result;
}

/** Soma 1 ao contador pedido e devolve o novo valor (lê e grava: processamento é sequencial, sem concorrência entre si). */
async function bumpCount(db: Db, campaignId: string, column: 'sent_count' | 'failed_count'): Promise<number> {
  const { data } = await db.from('campaigns').select(column).eq('id', campaignId).maybeSingle();
  const current = Number((data as Record<string, unknown> | null)?.[column] ?? 0);
  return current + 1;
}
