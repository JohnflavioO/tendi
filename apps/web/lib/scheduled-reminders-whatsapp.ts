import { ensureConversation } from '@/lib/dapi-webhook';
import { sendSystemMessage, type SendFn } from '@/lib/agenda-reminders-server';

type Admin = { from: (table: string) => any; rpc: (fn: string, args: object) => any };
type Reminder = {
  id: string; organization_id: string; recipient_type: 'me'|'client'|'team';
  recipient_user_id: string | null; contact_id: string | null;
  channel: 'push'|'whatsapp'|'both'; title: string; message: string;
};

/** Use the same D-API adapter and Inbox logging as existing appointment reminders. */
export async function sendScheduledWhatsApp(admin: Admin, job: Reminder, send: SendFn): Promise<{ ok: true } | { ok: false; error: string }> {
  if (job.recipient_type !== 'client' || !job.contact_id) {
    return { ok: false, error: 'WhatsApp para mim/equipe requer número associado ao perfil (ainda não disponível).' };
  }
  const { data: contact, error: contactError } = await admin.from('contacts')
    .select('id,phone_e164,opt_in').eq('id', job.contact_id)
    .eq('organization_id', job.organization_id).maybeSingle();
  if (contactError || !contact) return { ok: false, error: 'Cliente não encontrado nesta empresa.' };
  if (!contact.opt_in) return { ok: false, error: 'Cliente sem autorização de contato por WhatsApp.' };
  const phone = String(contact.phone_e164 ?? '').replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(phone)) return { ok: false, error: 'Cliente sem número de WhatsApp válido.' };

  const { data: org } = await admin.from('organizations')
    .select('status').eq('id', job.organization_id).maybeSingle();
  if (!org || ['suspended','cancelled','canceled','inactive'].includes(org.status)) {
    return { ok: false, error: 'Empresa inativa ou suspensa.' };
  }
  const { data: connection, error: connectionError } = await admin.from('channel_connections')
    .select('provider_account_id,status').eq('organization_id', job.organization_id)
    .eq('channel', 'whatsapp').maybeSingle();
  if (connectionError || connection?.status !== 'connected' || !connection.provider_account_id) {
    return { ok: false, error: 'WhatsApp da empresa não está conectado.' };
  }
  try {
    const conversation = await ensureConversation(admin as any, job.organization_id, job.contact_id, new Date().toISOString());
    const outcome = await sendSystemMessage(admin as any, {
      organizationId: job.organization_id,
      sessionId: connection.provider_account_id,
      conversationId: conversation.id,
      phone,
      text: `*Lembrete: ${job.title}*\n\n${job.message}`,
      kind: 'scheduled_reminder',
      appointmentId: job.id,
    }, send);
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error.slice(0, 250) };
  } catch {
    return { ok: false, error: 'Não foi possível preparar ou enviar o WhatsApp.' };
  }
}
