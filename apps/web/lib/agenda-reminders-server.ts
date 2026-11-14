import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TIME_ZONE, formatMinutes, localParts } from './agenda';
import {
  CONFIRMED_REPLY, REPLY_WINDOW_HOURS, RESCHEDULE_REPLY, normalizeReminderSettings, parseReminderReply, reminderDayLabel,
  reminderTiming, reminderVars, renderReminder,
} from './agenda-reminders';
import { DAPI_PROVIDER, ensureContact, ensureConversation } from './dapi-webhook';
import { isTrialExpired } from './trial';

/**
 * Lembretes da agenda no servidor: envio agendado e tratamento da resposta do cliente.
 * Sempre com a chave de serviço (não há usuário logado: quem chama é o agendador ou o webhook).
 *
 * Garantias:
 * - Um lembrete por agendamento: o agendamento é "reservado" (reminder_sent_at) antes do envio,
 *   então duas execuções simultâneas nunca mandam a mesma mensagem duas vezes.
 * - Falha no envio não é repetida automaticamente (fica marcada como "failed"): repetir poderia
 *   virar spam e aumentar o risco de bloqueio do número.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, unknown>;

/** Faz o POST na D-API (ex.: "/messages/send/text"). */
export type SendFn = (path: string, body: Json) => Promise<unknown>;

export const SYSTEM_SENDER_NAME = 'Lembrete automático';
const MAX_PER_RUN = 25;
const MAX_PER_ORGANIZATION = 10;
/** Intervalo entre envios: ritmo humano reduz o risco de bloqueio do número. */
const SEND_SPACING_MS = 1_200;
const BLOCKED_ORG_STATUS = ['suspended', 'cancelled', 'canceled', 'inactive'];

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

type Connection = { provider_account_id: string | null; status: string };

async function connectedSession(db: Db, organizationId: string): Promise<string | null> {
  const { data } = await db.from('channel_connections').select('provider_account_id,status')
    .eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle();
  const connection = data as Connection | null;
  return connection?.provider_account_id && connection.status === 'connected' ? connection.provider_account_id : null;
}

/**
 * Envia uma mensagem automática do sistema e a registra no Inbox (aparece como "Lembrete automático").
 * Não mexe no modo da IA nem em quem está com a conversa.
 */
export async function sendSystemMessage(db: Db, input: {
  organizationId: string; sessionId: string; conversationId: string; phone: string; text: string; kind: string; appointmentId: string;
}, send: SendFn): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = { source: 'agenda', kind: input.kind, appointment_id: input.appointmentId, sender: { type: 'system', name: SYSTEM_SENDER_NAME } };
  const inserted = await db.from('messages').insert({
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    direction: 'outbound',
    message_type: 'text',
    body: input.text,
    delivery_status: 'queued',
    provider: DAPI_PROVIDER,
    sent_at: new Date().toISOString(),
    payload,
  }).select('id').single();
  if (inserted.error || !inserted.data) return { ok: false, error: `Não foi possível registrar a mensagem: ${inserted.error?.message ?? 'sem retorno'}` };
  const messageId = (inserted.data as { id: string }).id;

  try {
    await send('/messages/send/text', { sessionId: input.sessionId, to: input.phone.replace(/\D/g, ''), text: input.text });
    await db.from('messages').update({ delivery_status: 'sent', sent_at: new Date().toISOString() }).eq('id', messageId);
    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', input.conversationId);
    return { ok: true };
  } catch (error) {
    const reason = errorText(error);
    await db.from('messages').update({ delivery_status: 'failed', payload: { ...payload, error: reason } }).eq('id', messageId);
    return { ok: false, error: reason };
  }
}

type DueAppointment = {
  id: string; organization_id: string; professional_id: string; contact_id: string | null; conversation_id: string | null;
  customer_name: string; customer_phone: string; service_name: string | null; starts_at: string;
};

export type ReminderRunResult = { organizations: number; checked: number; sent: number; failed: number; skipped: number };

/** Uma execução do agendador: envia os lembretes que estão na hora, em todas as empresas com o recurso ligado. */
export async function runAgendaReminders(db: Db, deps: { send: SendFn; now?: () => Date; sleep?: (ms: number) => Promise<void> }): Promise<ReminderRunResult> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const result: ReminderRunResult = { organizations: 0, checked: 0, sent: 0, failed: 0, skipped: 0 };

  const orgRows = await db.from('organizations')
    .select('id,name,status,trial_ends_at,timezone,agenda_settings')
    .eq('agenda_settings->reminders->>enabled', 'true');
  if (orgRows.error) throw new Error(`organizations: ${orgRows.error.message}`);

  for (const org of (orgRows.data ?? []) as Array<{ id: string; name: string; status: string; trial_ends_at: string | null; timezone: string | null; agenda_settings: unknown }>) {
    if (result.sent + result.failed >= MAX_PER_RUN) break;
    const settings = normalizeReminderSettings(org.agenda_settings);
    if (!settings.enabled) continue;
    // Empresa sem acesso (teste vencido ou suspensa) não envia mensagens automáticas.
    if (BLOCKED_ORG_STATUS.includes(org.status) || isTrialExpired(org, now())) continue;
    result.organizations += 1;

    const timeZone = org.timezone || DEFAULT_TIME_ZONE;
    const horizon = new Date(now().getTime() + settings.hoursBefore * 60 * 60 * 1000).toISOString();
    const due = await db.from('appointments')
      .select('id,organization_id,professional_id,contact_id,conversation_id,customer_name,customer_phone,service_name,starts_at')
      .eq('organization_id', org.id).eq('status', 'scheduled').is('reminder_sent_at', null).not('customer_phone', 'is', null)
      .gt('starts_at', now().toISOString()).lte('starts_at', horizon)
      .order('starts_at').limit(MAX_PER_ORGANIZATION);
    if (due.error) throw new Error(`appointments: ${due.error.message}`);
    const appointments = ((due.data ?? []) as DueAppointment[])
      .filter(item => reminderTiming({ startsAt: item.starts_at, now: now(), hoursBefore: settings.hoursBefore, timeZone }) === 'send');
    result.checked += (due.data ?? []).length;
    if (!appointments.length) continue;

    const sessionId = await connectedSession(db, org.id);
    if (!sessionId) { result.skipped += appointments.length; continue; }

    const professionalIds = [...new Set(appointments.map(item => item.professional_id))];
    const professionals = await db.from('agenda_professionals').select('id,name').in('id', professionalIds);
    const professionalName = new Map(((professionals.data ?? []) as Array<{ id: string; name: string }>).map(row => [row.id, row.name]));

    for (const appointment of appointments) {
      if (result.sent + result.failed >= MAX_PER_RUN) break;
      // Reserva o agendamento: só quem conseguir gravar reminder_sent_at envia.
      const claim = await db.from('appointments').update({ reminder_sent_at: now().toISOString() })
        .eq('id', appointment.id).eq('status', 'scheduled').is('reminder_sent_at', null).select('id');
      if (claim.error || !Array.isArray(claim.data) || claim.data.length === 0) { result.skipped += 1; continue; }

      let outcome: { ok: true } | { ok: false; error: string };
      let contactId = appointment.contact_id;
      let conversationId = appointment.conversation_id;
      try {
        if (!contactId) contactId = (await ensureContact(db, org.id, appointment.customer_phone, appointment.customer_name)).id;
        conversationId = (await ensureConversation(db, org.id, contactId, now().toISOString())).id;
        const text = renderReminder(settings.template, reminderVars({
          customerName: appointment.customer_name,
          organizationName: org.name,
          serviceName: appointment.service_name,
          professionalName: professionalName.get(appointment.professional_id) ?? 'nossa equipe',
          startsAt: appointment.starts_at,
          now: now(),
          timeZone,
        }));
        outcome = await sendSystemMessage(db, { organizationId: org.id, sessionId, conversationId, phone: appointment.customer_phone, text, kind: 'reminder', appointmentId: appointment.id }, deps.send);
      } catch (error) {
        outcome = { ok: false, error: errorText(error) };
      }

      await db.from('appointments').update({
        reminder_status: outcome.ok ? 'sent' : 'failed',
        reminder_error: outcome.ok ? null : outcome.error,
        contact_id: contactId,
        conversation_id: conversationId,
      }).eq('id', appointment.id);
      if (outcome.ok) result.sent += 1; else result.failed += 1;
      await sleep(SEND_SPACING_MS);
    }
  }
  return result;
}

export type ReplyOutcome = { handled: boolean; action?: 'confirmed' | 'reschedule'; appointmentId?: string };

/**
 * Mensagem nova do cliente: se for uma resposta curta ("1", "confirmo", "2", "preciso remarcar") a um
 * lembrete recente, atualiza a agenda e responde. Retorna handled=false para o atendimento seguir normal.
 */
export async function handleReminderReply(db: Db, input: { organizationId: string; contactId: string; conversationId: string; text: string | null }, deps: { send: SendFn; now?: () => Date }): Promise<ReplyOutcome> {
  const reply = parseReminderReply(input.text);
  if (!reply) return { handled: false };
  const now = deps.now ?? (() => new Date());
  const since = new Date(now().getTime() - REPLY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const found = await db.from('appointments')
    .select('id,customer_phone,starts_at')
    .eq('organization_id', input.organizationId).eq('contact_id', input.contactId)
    .eq('status', 'scheduled').eq('reminder_status', 'sent').is('reminder_reply', null)
    .gte('reminder_sent_at', since).gt('starts_at', now().toISOString())
    .order('starts_at').limit(1).maybeSingle();
  const appointment = found.data as { id: string; customer_phone: string | null; starts_at: string } | null;
  if (found.error || !appointment) return { handled: false };

  const { data: org } = await db.from('organizations').select('timezone').eq('id', input.organizationId).maybeSingle();
  const timeZone = (org as { timezone?: string | null } | null)?.timezone || DEFAULT_TIME_ZONE;

  // Trava contra duas respostas simultâneas: só a primeira atualização vale.
  const patch = reply === 'confirm'
    ? { status: 'confirmed', confirmed_at: now().toISOString(), reminder_reply: 'confirmed' }
    : { reminder_reply: 'reschedule', reschedule_requested_at: now().toISOString() };
  const updated = await db.from('appointments').update(patch).eq('id', appointment.id).eq('status', 'scheduled').is('reminder_reply', null).select('id');
  if (updated.error || !Array.isArray(updated.data) || updated.data.length === 0) return { handled: false };

  const day = reminderDayLabel(appointment.starts_at, now(), timeZone);
  const hour = formatMinutes(localParts(appointment.starts_at, timeZone).minutes);
  if (reply === 'reschedule') {
    // Pedido de remarcação precisa de gente: avisa a equipe com uma nota interna e tira a IA da conversa.
    await db.from('messages').insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      direction: 'internal',
      message_type: 'system',
      body: `O cliente pediu para remarcar o horário de ${day} às ${hour}. O agendamento continua na agenda até alguém remarcar ou cancelar.`,
      delivery_status: 'sent',
      payload: { source: 'agenda', kind: 'reschedule_request', appointment_id: appointment.id },
    });
    await db.from('conversations').update({ status: 'open', ai_mode: 'handoff' }).eq('id', input.conversationId).eq('ai_mode', 'on');
  }

  const sessionId = await connectedSession(db, input.organizationId);
  if (sessionId && appointment.customer_phone) {
    const text = reply === 'confirm' ? CONFIRMED_REPLY.replace('{dia}', day).replace('{hora}', hour) : RESCHEDULE_REPLY;
    await sendSystemMessage(db, { organizationId: input.organizationId, sessionId, conversationId: input.conversationId, phone: appointment.customer_phone, text, kind: reply === 'confirm' ? 'reminder_confirmed' : 'reminder_reschedule', appointmentId: appointment.id }, deps.send);
  }
  return { handled: true, action: reply === 'confirm' ? 'confirmed' : 'reschedule', appointmentId: appointment.id };
}
