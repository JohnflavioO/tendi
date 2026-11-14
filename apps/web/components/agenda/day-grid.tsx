'use client';

import { CalendarOff } from 'lucide-react';
import { STATUS_INFO, formatMinutes, localParts, weekdayOf, SLOT_STEP_MINUTES } from '@/lib/agenda';
import { shiftsFor, type Appointment, type HoursRow, type Professional } from '@/components/agenda/types';

const PX_PER_MINUTE = 1.2;

/**
 * Grade do dia: uma coluna por profissional, com os horários de atendimento em branco,
 * o restante sombreado e os agendamentos posicionados pela hora.
 * Clicar num espaço vazio abre um novo agendamento naquele horário.
 */
export function DayGrid({ day, timeZone, professionals, hours, appointments, nowMinutes, onCreate, onOpen }: {
  day: string;
  timeZone: string;
  professionals: Professional[];
  hours: HoursRow[];
  appointments: Appointment[];
  /** Minutos do dia agora, quando `day` é hoje (desenha a linha do horário atual). */
  nowMinutes: number | null;
  onCreate: (professionalId: string, minutes: number) => void;
  onOpen: (appointment: Appointment) => void;
}) {
  const weekday = weekdayOf(day);
  const placed = appointments.map(appointment => {
    const start = localParts(appointment.starts_at, timeZone);
    const end = localParts(appointment.ends_at, timeZone);
    // Agendamento que termina depois da meia-noite: corta no fim do dia.
    return { appointment, start: start.minutes, end: end.day === start.day ? end.minutes : 24 * 60 };
  });

  // Janela exibida: do primeiro ao último horário de atendimento ou agendamento, com folga de 30 min.
  const allShifts = professionals.flatMap(professional => shiftsFor(hours, professional.id, weekday));
  const starts = [...allShifts.map(shift => shift.start), ...placed.map(item => item.start)];
  const ends = [...allShifts.map(shift => shift.end), ...placed.map(item => item.end)];
  const from = Math.max(0, Math.floor(((starts.length ? Math.min(...starts) : 8 * 60) - 30) / 60) * 60);
  const to = Math.min(24 * 60, Math.ceil(((ends.length ? Math.max(...ends) : 18 * 60) + 30) / 60) * 60);
  const height = (to - from) * PX_PER_MINUTE;
  const hourMarks: number[] = [];
  for (let minute = from; minute <= to; minute += 60) hourMarks.push(minute);

  if (!professionals.length) return null;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-100 bg-white">
          <div className="h-12 border-b border-slate-100" />
          <div className="relative" style={{ height }}>
            {hourMarks.map(minute => (
              <span key={minute} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: (minute - from) * PX_PER_MINUTE }}>
                {minute === from ? '' : formatMinutes(minute)}
              </span>
            ))}
          </div>
        </div>

        {professionals.map(professional => {
          const shifts = shiftsFor(hours, professional.id, weekday);
          const mine = placed.filter(item => item.appointment.professional_id === professional.id);
          return (
            <div key={professional.id} className="min-w-[190px] flex-1 border-r border-slate-100 last:border-r-0">
              <div className="flex h-12 items-center gap-2 border-b border-slate-100 px-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: professional.color }} />
                <span className="truncate text-sm font-semibold text-[#25275B]">{professional.name}</span>
                {!shifts.length && <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-slate-400"><CalendarOff size={12} />Folga</span>}
              </div>
              <div
                className="relative cursor-pointer bg-slate-100"
                style={{ height }}
                role="button"
                tabIndex={0}
                aria-label={`Novo agendamento com ${professional.name}`}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCreate(professional.id, shifts[0]?.start ?? 9 * 60); } }}
                onClick={event => {
                  if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.free) return;
                  const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
                  const minute = from + Math.floor(offset / PX_PER_MINUTE / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
                  onCreate(professional.id, Math.max(0, Math.min(24 * 60 - SLOT_STEP_MINUTES, minute)));
                }}
              >
                {/* Horário de atendimento em branco; o resto fica sombreado. */}
                {shifts.map(shift => (
                  <div key={`${shift.start}-${shift.end}`} data-free="1" className="absolute inset-x-0 bg-white" style={{ top: (shift.start - from) * PX_PER_MINUTE, height: (shift.end - shift.start) * PX_PER_MINUTE }} />
                ))}
                {hourMarks.map(minute => (
                  <div key={minute} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: (minute - from) * PX_PER_MINUTE }} />
                ))}
                {nowMinutes !== null && nowMinutes >= from && nowMinutes <= to && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[#CB0A9F]" style={{ top: (nowMinutes - from) * PX_PER_MINUTE }} />
                )}
                {mine.map(({ appointment, start, end }) => {
                  const info = STATUS_INFO[appointment.status] ?? STATUS_INFO.scheduled;
                  const blockHeight = Math.max(24, (end - start) * PX_PER_MINUTE - 2);
                  const wantsReschedule = appointment.reminder_reply === 'reschedule' && appointment.status === 'scheduled';
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onOpen(appointment)}
                      title={`${formatMinutes(start)}–${formatMinutes(end)} · ${appointment.customer_name} · ${wantsReschedule ? 'Pediu para remarcar' : info.label}`}
                      className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#CB0A9F] ${wantsReschedule ? 'border-amber-300 bg-amber-50 text-amber-900' : info.tone}`}
                      style={{ top: (start - from) * PX_PER_MINUTE + 1, height: blockHeight, borderLeftWidth: 4, borderLeftColor: professional.color }}
                    >
                      <span className="block truncate text-[11px] font-bold leading-4">{formatMinutes(start)} {appointment.customer_name}</span>
                      {blockHeight >= 40 && <span className="block truncate text-[10px] leading-4 opacity-80">{appointment.service_name ?? 'Atendimento'} · {wantsReschedule ? 'Pediu para remarcar' : info.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
