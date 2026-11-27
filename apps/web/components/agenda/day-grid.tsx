'use client';

import { CalendarOff, MoreHorizontal } from 'lucide-react';
import { STATUS_INFO, formatDuration, formatMinutes, formatPrice, localParts, weekdayOf } from '@/lib/agenda';
import { shiftsFor, type Appointment, type HoursRow, type Professional } from '@/components/agenda/types';

/** Menor intervalo livre que vale a pena mostrar como "Livre até"; abaixo disso só teria ruído. */
const MIN_GAP_MINUTES = 10;

type Placed = { appointment: Appointment; start: number; end: number };
type Entry = { kind: 'appointment'; start: number; placed: Placed } | { kind: 'gap'; start: number; end: number };

/**
 * Agenda do dia: uma coluna por profissional, cada uma como uma lista de horários (não uma
 * grade proporcional ao tempo) — o intervalo livre vira uma linha só ("Livre até X"), em vez de
 * um espaço em branco do tamanho do intervalo. Funciona igual em qualquer largura de tela.
 */
export function DayGrid({ day, timeZone, professionals, hours, appointments, onCreate, onOpen, onQuickStatus }: {
  day: string;
  timeZone: string;
  professionals: Professional[];
  hours: HoursRow[];
  appointments: Appointment[];
  onCreate: (professionalId: string, minutes: number) => void;
  onOpen: (appointment: Appointment) => void;
  /** Ação rápida do card, sem abrir o diálogo inteiro. */
  onQuickStatus: (appointment: Appointment, status: 'completed' | 'no_show') => void;
}) {
  const weekday = weekdayOf(day);

  if (!professionals.length) return null;

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {professionals.map(professional => {
        const shifts = shiftsFor(hours, professional.id, weekday);
        const mine = appointments
          .filter(item => item.professional_id === professional.id)
          .map(appointment => {
            const start = localParts(appointment.starts_at, timeZone);
            const end = localParts(appointment.ends_at, timeZone);
            return { appointment, start: start.minutes, end: end.day === start.day ? end.minutes : 24 * 60 };
          });
        const blocking = mine.filter(item => item.appointment.status === 'scheduled' || item.appointment.status === 'confirmed' || item.appointment.status === 'completed');

        // Dentro de cada turno, preenche com agendamentos ativos e marca o que sobra como "livre".
        const gaps: Array<{ start: number; end: number }> = [];
        for (const shift of [...shifts].sort((a, b) => a.start - b.start)) {
          let cursor = shift.start;
          const within = blocking.filter(item => item.start < shift.end && item.end > shift.start).sort((a, b) => a.start - b.start);
          for (const item of within) {
            if (item.start - cursor >= MIN_GAP_MINUTES) gaps.push({ start: cursor, end: item.start });
            cursor = Math.max(cursor, item.end);
          }
          if (shift.end - cursor >= MIN_GAP_MINUTES) gaps.push({ start: cursor, end: shift.end });
        }

        const entries: Entry[] = [
          ...mine.map((placed): Entry => ({ kind: 'appointment', start: placed.start, placed })),
          ...gaps.map((gap): Entry => ({ kind: 'gap', start: gap.start, end: gap.end })),
        ].sort((a, b) => a.start - b.start);

        const hoursLabel = shifts.length
          ? `${formatMinutes(Math.min(...shifts.map(s => s.start)))} às ${formatMinutes(Math.max(...shifts.map(s => s.end)))}`
          : null;

        return (
          <div key={professional.id} className="td-card min-w-0 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-tendi-line/70 bg-tendi-haze/40 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: professional.color }}>{professional.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-tendi-navy">{professional.name}</p>
                <p className="truncate text-[11px] text-slate-400">{hoursLabel ? `${hoursLabel} · ${mine.length} atendimento${mine.length === 1 ? '' : 's'}` : 'Sem horário hoje'}</p>
              </div>
              {!shifts.length && <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-400"><CalendarOff size={12} />Folga</span>}
            </div>

            <div className="divide-y divide-tendi-line/60">
              {!entries.length && <p className="px-4 py-6 text-center text-xs text-slate-400">Nada marcado hoje.</p>}
              {entries.map(entry => entry.kind === 'gap' ? (
                <button key={`gap-${entry.start}`} type="button" onClick={() => onCreate(professional.id, entry.start)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] text-slate-400 transition hover:bg-tendi-haze">
                  <span className="shrink-0 font-semibold tabular-nums">{formatMinutes(entry.start)}</span>
                  <span className="h-px flex-1 border-t border-dashed border-tendi-line" />
                  <span className="shrink-0">Livre até {formatMinutes(entry.end)}</span>
                </button>
              ) : (
                <AppointmentCard key={entry.placed.appointment.id} placed={entry.placed} onOpen={onOpen} onQuickStatus={onQuickStatus} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppointmentCard({ placed, onOpen, onQuickStatus }: {
  placed: Placed;
  onOpen: (appointment: Appointment) => void;
  onQuickStatus: (appointment: Appointment, status: 'completed' | 'no_show') => void;
}) {
  const { appointment, start, end } = placed;
  const info = STATUS_INFO[appointment.status] ?? STATUS_INFO.scheduled;
  const wantsReschedule = appointment.reminder_reply === 'reschedule' && appointment.status === 'scheduled';
  const pending = appointment.status === 'scheduled' || appointment.status === 'confirmed';
  const detail = [appointment.service_name ?? 'Atendimento', `até ${formatMinutes(end)}`, appointment.price_cents !== null ? formatPrice(appointment.price_cents) : null]
    .filter(Boolean).join(' · ');

  return (
    <div className={`px-4 py-3 ${appointment.status === 'cancelled' ? 'opacity-50' : ''}`}>
      <button type="button" onClick={() => onOpen(appointment)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold tabular-nums text-tendi-navy">{formatMinutes(start)}</span>
          {wantsReschedule && <span className="td-badge td-badge-warning shrink-0 !text-[10px]">Pediu p/ remarcar</span>}
        </div>
        <p className={`mt-0.5 truncate text-sm font-semibold ${appointment.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-tendi-navy'}`}>{appointment.customer_name}</p>
        <p className="truncate text-xs text-slate-500">{detail} · {formatDuration(end - start)}</p>
      </button>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {pending ? <>
          <button type="button" onClick={() => onQuickStatus(appointment, 'completed')} className="td-btn td-btn-teal td-btn-sm">Atendido</button>
          <button type="button" onClick={() => onQuickStatus(appointment, 'no_show')} className="td-btn td-btn-secondary td-btn-sm">Não veio</button>
        </> : (
          <span className={`td-badge !text-[10px] ${appointment.status === 'completed' ? 'td-badge-teal' : appointment.status === 'no_show' ? 'td-badge-danger' : 'td-badge-neutral'}`}>{info.label}</span>
        )}
        <button type="button" onClick={() => onOpen(appointment)} aria-label="Mais ações" className="td-icon-btn ml-auto size-8"><MoreHorizontal size={15} /></button>
      </div>
    </div>
  );
}
