/**
 * Agenda: regras de horário, status e modelos por segmento.
 * Funções puras (sem rede e sem banco), usadas pela tela e, depois, pela IA e pelos lembretes.
 *
 * Os horários de atendimento são "hora de parede" no fuso da empresa (ex.: 09:00 em São Paulo);
 * os agendamentos ficam no banco em UTC. As funções de fuso fazem a ponte entre os dois.
 */

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];

export const STATUS_INFO: Record<AppointmentStatus, { label: string; tone: string; dot: string }> = {
  scheduled: { label: 'Agendado', tone: 'border-sky-200 bg-sky-50 text-sky-900', dot: 'bg-sky-500' },
  confirmed: { label: 'Confirmado', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-500' },
  completed: { label: 'Atendido', tone: 'border-slate-200 bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  no_show: { label: 'Faltou', tone: 'border-rose-200 bg-rose-50 text-rose-900', dot: 'bg-rose-500' },
  cancelled: { label: 'Cancelado', tone: 'border-slate-200 bg-white text-slate-400 line-through', dot: 'bg-slate-300' },
};

/** Status que ocupam o horário do profissional (cancelado e falta liberam o horário). */
export const isBlockingStatus = (status: string): boolean => status === 'scheduled' || status === 'confirmed' || status === 'completed';

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
export const SLOT_STEP_MINUTES = 15;

// ---------------------------------------------------------------------------------------------
// Minutos do dia
// ---------------------------------------------------------------------------------------------

/** "09:30" ou "09:30:00" -> 570. Retorna null se não for um horário válido. */
export function minutesOf(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((time ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** 570 -> "09:30" */
export function formatMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** 45 -> "45 min"; 60 -> "1 h"; 90 -> "1 h 30" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest}` : `${Math.floor(minutes / 60)} h`;
}

export type Interval = { start: number; end: number };

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

// ---------------------------------------------------------------------------------------------
// Fuso horário
// ---------------------------------------------------------------------------------------------

function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return timeZone; } catch { return DEFAULT_TIME_ZONE; }
}

function zonedFields(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')), second: Number(get('second')), weekday: get('weekday') };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Diferença (em minutos) entre a hora local do fuso e o UTC naquele instante. São Paulo = -180. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const f = zonedFields(instant, timeZone);
  return Math.round((Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - instant.getTime()) / 60_000);
}

/** Dia e horário locais da empresa -> instante real. Ex.: ("2026-11-12", 540, "America/Sao_Paulo") = 12:00 UTC. */
export function zonedToUtc(day: string, minutes: number, timeZone?: string | null): Date {
  const zone = safeTimeZone(timeZone);
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year!, (month ?? 1) - 1, date ?? 1, 0, minutes);
  const first = guess - offsetMinutes(new Date(guess), zone) * 60_000;
  // Segunda passada para dias de mudança de horário de verão.
  return new Date(guess - offsetMinutes(new Date(first), zone) * 60_000);
}

/** Instante real -> dia ("AAAA-MM-DD"), minutos do dia e dia da semana no fuso da empresa. */
export function localParts(instant: Date | string, timeZone?: string | null): { day: string; minutes: number; weekday: number } {
  const f = zonedFields(typeof instant === 'string' ? new Date(instant) : instant, safeTimeZone(timeZone));
  return {
    day: `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`,
    minutes: f.hour * 60 + f.minute,
    weekday: WEEKDAY_INDEX[f.weekday] ?? 0,
  };
}

/** Início e fim (instantes) de um dia local, para buscar os agendamentos daquele dia. */
export function dayRange(day: string, timeZone?: string | null): { from: Date; to: Date } {
  return { from: zonedToUtc(day, 0, timeZone), to: zonedToUtc(shiftDay(day, 1), 0, timeZone) };
}

/** "2026-11-12" + 1 -> "2026-11-13" (aritmética de calendário, sem fuso). */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, (date ?? 1) + delta)).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de um dia de calendário. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, date ?? 1)).getUTCDay();
}

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** "quinta-feira, 12 de novembro" */
export function formatDayLong(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year!, (month ?? 1) - 1, date ?? 1)));
}

// ---------------------------------------------------------------------------------------------
// Horários livres
// ---------------------------------------------------------------------------------------------

/**
 * Horários de início livres para um serviço num dia.
 * `hours`: turnos de atendimento do profissional (minutos do dia). `busy`: horários já ocupados.
 * `earliest`: não oferecer antes disso (ex.: agora, para o dia de hoje).
 */
export function freeSlots(input: { hours: Interval[]; busy: Interval[]; duration: number; step?: number; earliest?: number }): number[] {
  const step = input.step ?? SLOT_STEP_MINUTES;
  if (!(input.duration > 0) || !(step > 0)) return [];
  const slots: number[] = [];
  for (const shift of [...input.hours].sort((a, b) => a.start - b.start)) {
    for (let start = Math.ceil(shift.start / step) * step; start + input.duration <= shift.end; start += step) {
      if (input.earliest !== undefined && start < input.earliest) continue;
      const candidate = { start, end: start + input.duration };
      if (!input.busy.some(taken => overlaps(candidate, taken)) && !slots.includes(start)) slots.push(start);
    }
  }
  return slots;
}

/** O horário cabe em algum turno de atendimento do profissional? */
export function withinHours(candidate: Interval, hours: Interval[]): boolean {
  return hours.some(shift => candidate.start >= shift.start && candidate.end <= shift.end);
}

// ---------------------------------------------------------------------------------------------
// Cliente, preço e resumo do dia
// ---------------------------------------------------------------------------------------------

/** Telefone para o WhatsApp: só dígitos, com DDI. "(85) 99999-0000" -> "+5585999990000". null se inválido. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // 10 ou 11 dígitos = DDD + número do Brasil, sem o código do país.
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return full.length >= 10 && full.length <= 15 ? `+${full}` : null;
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** "49,90" / "R$ 49,90" / "50" -> centavos. null para vazio; NaN para valor inválido. */
export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : Number.NaN;
}

export type SummaryAppointment = { status: string; price_cents?: number | null };

/** Números do dia para o painel: marcados, confirmados, atendidos, faltas e valores. */
export function daySummary(appointments: SummaryAppointment[]) {
  const count = (status: AppointmentStatus) => appointments.filter(item => item.status === status).length;
  const sum = (statuses: AppointmentStatus[]) => appointments
    .filter(item => (statuses as string[]).includes(item.status))
    .reduce((total, item) => total + (item.price_cents ?? 0), 0);
  const active = appointments.filter(item => item.status !== 'cancelled').length;
  return {
    total: active,
    scheduled: count('scheduled'),
    confirmed: count('confirmed'),
    completed: count('completed'),
    noShow: count('no_show'),
    cancelled: count('cancelled'),
    expectedCents: sum(['scheduled', 'confirmed', 'completed']),
    receivedCents: sum(['completed']),
  };
}

// ---------------------------------------------------------------------------------------------
// Modelos por segmento
// ---------------------------------------------------------------------------------------------

export type Segment = 'clinic' | 'barbershop' | 'beauty' | 'other';

export const SEGMENTS: Segment[] = ['barbershop', 'clinic', 'beauty', 'other'];

export const SEGMENT_INFO: Record<Segment, {
  label: string;
  customer: string;
  professional: string;
  services: Array<{ name: string; duration: number; priceCents: number | null }>;
}> = {
  barbershop: {
    label: 'Barbearia',
    customer: 'Cliente',
    professional: 'Barbeiro',
    services: [
      { name: 'Corte', duration: 30, priceCents: null },
      { name: 'Barba', duration: 20, priceCents: null },
      { name: 'Corte + barba', duration: 50, priceCents: null },
      { name: 'Sobrancelha', duration: 10, priceCents: null },
    ],
  },
  clinic: {
    label: 'Clínica ou consultório',
    customer: 'Paciente',
    professional: 'Profissional',
    services: [
      { name: 'Avaliação', duration: 60, priceCents: null },
      { name: 'Consulta', duration: 30, priceCents: null },
      { name: 'Retorno', duration: 20, priceCents: null },
      { name: 'Sessão', duration: 50, priceCents: null },
    ],
  },
  beauty: {
    label: 'Salão ou estética',
    customer: 'Cliente',
    professional: 'Profissional',
    services: [
      { name: 'Corte', duration: 45, priceCents: null },
      { name: 'Escova', duration: 40, priceCents: null },
      { name: 'Manicure', duration: 40, priceCents: null },
      { name: 'Limpeza de pele', duration: 60, priceCents: null },
    ],
  },
  other: { label: 'Outro negócio com hora marcada', customer: 'Cliente', professional: 'Profissional', services: [] },
};

export const isSegment = (value: unknown): value is Segment => typeof value === 'string' && (SEGMENTS as string[]).includes(value);

/** Horário comercial sugerido ao cadastrar um profissional: segunda a sábado, 09:00 às 18:00. */
export const DEFAULT_WEEK_HOURS: Array<{ weekday: number; starts: string; ends: string }> =
  [1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, starts: '09:00', ends: '18:00' }));

export const PROFESSIONAL_COLORS = ['#004751', '#2F316B', '#CB0A9F', '#B45309', '#0F766E', '#7C3AED', '#BE123C', '#1D4ED8'] as const;
