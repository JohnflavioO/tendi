import { sendReminderPush } from '@/lib/firebase-server';
import { sendScheduledWhatsApp } from '@/lib/scheduled-reminders-whatsapp';
import type { SendFn } from '@/lib/agenda-reminders-server';

type Admin = { from: (table: string) => any; rpc: (fn: string, args: object) => any };
type Reminder = {
  id: string; organization_id: string; recipient_type: 'me'|'client'|'team';
  recipient_user_id: string | null; contact_id: string | null; channel: 'push'|'whatsapp'|'both';
  title: string; message: string;
};

/**
 * Runs inside the existing authenticated agenda cron.
 * Atomic RPC claim prevents concurrent workers from claiming the same reminder.
 * WhatsApp dispatch is restricted to opted-in contacts with a connected business channel.
 */
export async function runScheduledPushReminders(admin: Admin, deps: { send: SendFn }) {
  const { data, error } = await admin.rpc('claim_due_scheduled_reminders', { batch_size: 20 });
  if (error) throw new Error('Não foi possível reservar os lembretes vencidos.');
  const jobs = (data ?? []) as Reminder[];
  const result = { claimed: jobs.length, sent: 0, partial: 0, failed: 0 };
  for (const job of jobs) {
    let pushStatus: 'sent'|'failed'|'skipped' = 'skipped';
    let whatsappStatus: 'sent'|'failed'|'skipped' = 'skipped';
    const errors: string[] = [];
    if (job.channel === 'push' || job.channel === 'both') {
      if (!job.recipient_user_id) {
        pushStatus = 'failed';
        errors.push('Cliente sem conta de usuário para receber push.');
      } else {
        const { data: member, error: memberError } = await admin.from('organization_memberships')
          .select('user_id').eq('organization_id', job.organization_id)
          .eq('user_id', job.recipient_user_id).eq('status', 'active').maybeSingle();
        if (memberError || !member) {
          pushStatus = 'failed';
          errors.push('Destinatário sem acesso ativo à empresa.');
        } else {
          const { data: devices, error: deviceError } = await admin.from('push_devices')
            .select('fcm_token').eq('organization_id', job.organization_id)
            .eq('user_id', job.recipient_user_id).eq('enabled', true)
            .order('last_seen_at', { ascending: false }).limit(1);
          if (deviceError || !devices?.length) {
            pushStatus = 'failed';
            errors.push('Destinatário sem dispositivo com notificações ativadas.');
          } else {
            try {
              await sendReminderPush(devices[0].fcm_token, job.title, job.message, job.id);
              pushStatus = 'sent';
            } catch {
              pushStatus = 'failed';
              errors.push('Firebase não confirmou o envio.');
            }
          }
        }
      }
    }
    if (job.channel === 'whatsapp' || job.channel === 'both') {
      const outcome = await sendScheduledWhatsApp(admin, job, deps.send);
      whatsappStatus = outcome.ok ? 'sent' : 'failed';
      if (!outcome.ok) errors.push(outcome.error);
    }
    const success = pushStatus === 'sent' || whatsappStatus === 'sent';
    const failure = pushStatus === 'failed' || whatsappStatus === 'failed';
    const status = success && failure ? 'partial' : success ? 'sent' : 'failed';
    const { error: updateError } = await admin.from('scheduled_reminders').update({
      status, push_status: pushStatus, whatsapp_status: whatsappStatus,
      last_error: errors.join(' ').slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'processing');
    if (updateError) throw new Error('Não foi possível registrar o resultado de um lembrete.');
    if (status === 'sent') result.sent++;
    else if (status === 'partial') result.partial++;
    else result.failed++;
  }
  return result;
}
