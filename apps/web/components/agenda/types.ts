import type { AppointmentStatus, Interval } from '@/lib/agenda';
import { minutesOf } from '@/lib/agenda';

export type AgendaOrganization = { id: string; name: string; timezone: string; business_segment: string | null; agenda_settings: unknown };
export type Professional = { id: string; name: string; color: string; is_active: boolean; position: number };
export type Service = { id: string; name: string; duration_minutes: number; price_cents: number | null; is_active: boolean };
export type HoursRow = { id?: string; professional_id: string; weekday: number; starts: string; ends: string };
export type Appointment = {
  id: string;
  professional_id: string;
  service_id: string | null;
  contact_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  service_name: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  price_cents: number | null;
  source: string;
  reminder_status: 'sent' | 'failed' | null;
  reminder_sent_at: string | null;
  reminder_error: string | null;
  reminder_reply: 'confirmed' | 'reschedule' | null;
  reschedule_requested_at: string | null;
};

export const APPOINTMENT_COLUMNS = 'id,professional_id,service_id,contact_id,customer_name,customer_phone,service_name,starts_at,ends_at,status,notes,price_cents,source,reminder_status,reminder_sent_at,reminder_error,reminder_reply,reschedule_requested_at';

/** Turnos de atendimento de um profissional num dia da semana, em minutos do dia. */
export function shiftsFor(hours: HoursRow[], professionalId: string, weekday: number): Interval[] {
  return hours
    .filter(row => row.professional_id === professionalId && row.weekday === weekday)
    .map(row => ({ start: minutesOf(row.starts) ?? 0, end: minutesOf(row.ends) ?? 0 }))
    .filter(shift => shift.end > shift.start)
    .sort((a, b) => a.start - b.start);
}

export const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0] disabled:bg-slate-50 disabled:text-slate-400';
export const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';
