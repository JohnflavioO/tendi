import type { SupabaseClient } from '@supabase/supabase-js';
import { formatMinutes, localParts } from './agenda';
import { ensureContact, ensureConversation } from './dapi-webhook';
import { connectedSession, sendSystemMessage, type SendFn } from './agenda-reminders-server';

/**
 * Aviso de mudança feita pela equipe: quando alguém cancela ou remarca um agendamento direto no
 * painel (fora do fluxo de lembrete automático), o cliente recebe um aviso imediato por WhatsApp.
 * Mesmo molde de agenda-reminders-server.ts (sem sessão de usuário; quem chama já validou o acesso).
 */

type Db = SupabaseClient<any, any, any>;

export type NotifyAction = 'cancelled' | 'rescheduled';
export type NotifyResult = { ok: true } | { ok: false; status: number; error: string };

export async function notifyAppointmentChange(db: Db, input: {
  appointmentId: string; organizationId: string; organizationName: string; timeZone: string;
  professionalName: string; customerName: string; customerPhone: string | null;
  contactId: string | null; conversationId: string | null; startsAt: string; action: NotifyAction;
}, send: SendFn): Promise<NotifyResult> {
  if (!input.customerPhone) return { ok: false, status: 400, error: 'Esse agendamento não tem WhatsApp cadastrado.' };
  const sessionId = await connectedSession(db, input.organizationId);
  if (!sessionId) return { ok: false, status: 409, error: 'O WhatsApp da empresa não está conectado.' };

  const contactId = input.contactId ?? (await ensureContact(db, input.organizationId, input.customerPhone, input.customerName)).id;
  const conversationId = input.conversationId ?? (await ensureConversation(db, input.organizationId, contactId, new Date().toISOString())).id;

  const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: input.timeZone }).format(new Date(input.startsAt));
  const timeLabel = formatMinutes(localParts(input.startsAt, input.timeZone).minutes);
  const text = input.action === 'cancelled'
    ? `Olá, ${input.customerName}! Seu horário com ${input.professionalName} (${input.organizationName}) de ${dayLabel} às ${timeLabel} foi cancelado. Qualquer dúvida, é só chamar por aqui.`
    : `Olá, ${input.customerName}! Seu horário com ${input.professionalName} (${input.organizationName}) foi remarcado para ${dayLabel} às ${timeLabel}. Qualquer dúvida, é só chamar por aqui.`;

  const outcome = await sendSystemMessage(db, {
    organizationId: input.organizationId, sessionId, conversationId, phone: input.customerPhone, text,
    kind: input.action === 'cancelled' ? 'staff_cancelled' : 'staff_rescheduled', appointmentId: input.appointmentId,
  }, send);
  return outcome.ok ? { ok: true } : { ok: false, status: 502, error: outcome.error };
}
