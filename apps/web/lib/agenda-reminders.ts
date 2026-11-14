/**
 * Lembretes da agenda: configuração, texto, momento de envio e leitura da resposta do cliente.
 * Funções puras (sem rede e sem banco).
 *
 * Fluxo: o agendador chama o servidor a cada 10 minutos -> para cada agendamento "Agendado" com
 * WhatsApp, dentro da antecedência configurada, envia o lembrete uma única vez -> o cliente responde
 * 1 (confirma) ou 2 (pede para remarcar) -> a agenda é atualizada.
 */
import { formatMinutes, localParts } from './agenda';

export type ReminderSettings = { enabled: boolean; hoursBefore: number; template: string };

export const REMINDER_LEAD_OPTIONS = [2, 4, 12, 24, 48] as const;

export const DEFAULT_REMINDER_TEMPLATE =
  'Olá, {nome}! Passando para lembrar do seu horário na {empresa}: {servico} com {profissional}, {dia} às {hora}.\n\nResponda *1* para confirmar ou *2* se precisar remarcar.';

/** Desligado por padrão: a empresa precisa escolher enviar mensagens automáticas. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: false, hoursBefore: 24, template: DEFAULT_REMINDER_TEMPLATE };

export const MAX_REMINDER_TEMPLATE_LENGTH = 700;
/** Não avisa em cima da hora: o cliente precisa de tempo para responder. */
export const MIN_LEAD_MINUTES = 45;
/** Horário em que o WhatsApp do cliente pode tocar (fuso da empresa). */
export const QUIET_START_MINUTES = 21 * 60;
export const QUIET_END_MINUTES = 8 * 60;
/** Depois do lembrete, por quanto tempo um "1" ou "2" ainda vale como resposta a ele. */
export const REPLY_WINDOW_HOURS = 72;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Lê organizations.agenda_settings.reminders; qualquer valor inválido cai no padrão. */
export function normalizeReminderSettings(agendaSettings: unknown): ReminderSettings {
  const raw = isRecord(agendaSettings) && isRecord(agendaSettings.reminders) ? agendaSettings.reminders : {};
  const hours = Number(raw.hoursBefore);
  const template = typeof raw.template === 'string' ? raw.template.trim().slice(0, MAX_REMINDER_TEMPLATE_LENGTH) : '';
  return {
    enabled: raw.enabled === true,
    hoursBefore: (REMINDER_LEAD_OPTIONS as readonly number[]).includes(hours) ? hours : DEFAULT_REMINDER_SETTINGS.hoursBefore,
    template: template || DEFAULT_REMINDER_TEMPLATE,
  };
}

export type ReminderVars = { nome: string; empresa: string; servico: string; profissional: string; dia: string; hora: string };

export const REMINDER_VARIABLES: Array<{ key: keyof ReminderVars; label: string }> = [
  { key: 'nome', label: 'primeiro nome do cliente' },
  { key: 'empresa', label: 'nome da empresa' },
  { key: 'servico', label: 'serviço marcado' },
  { key: 'profissional', label: 'quem vai atender' },
  { key: 'dia', label: 'dia do atendimento' },
  { key: 'hora', label: 'horário' },
];

/** Troca {nome}, {dia}... pelo valor. Chaves desconhecidas ficam como estão. */
export function renderReminder(template: string, vars: ReminderVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key as keyof ReminderVars] : match)).trim();
}

/** "hoje", "amanhã" ou "sexta-feira, 13/11", no fuso da empresa. */
export function reminderDayLabel(startsAt: Date | string, now: Date, timeZone?: string | null): string {
  const target = localParts(startsAt, timeZone);
  const today = localParts(now, timeZone);
  if (target.day === today.day) return 'hoje';
  const tomorrow = localParts(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone);
  if (target.day === tomorrow.day) return 'amanhã';
  const [year, month, date] = target.day.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year!, month! - 1, date!)));
  return `${weekday}, ${String(date).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

export function reminderVars(input: {
  customerName: string; organizationName: string; serviceName: string | null; professionalName: string;
  startsAt: Date | string; now: Date; timeZone?: string | null;
}): ReminderVars {
  return {
    nome: input.customerName.trim().split(/\s+/)[0] || 'cliente',
    empresa: input.organizationName,
    servico: input.serviceName?.trim() || 'seu atendimento',
    profissional: input.professionalName,
    dia: reminderDayLabel(input.startsAt, input.now, input.timeZone),
    hora: formatMinutes(localParts(input.startsAt, input.timeZone).minutes),
  };
}

export type ReminderTiming = 'wait' | 'send' | 'too_late';

/**
 * Hora de enviar?
 * - 'wait': ainda falta mais que a antecedência, ou é horário de silêncio (21h–8h) no fuso da empresa.
 * - 'send': dentro da antecedência e fora do silêncio.
 * - 'too_late': faltam menos de 45 minutos (ou já passou): não envia mais.
 */
export function reminderTiming(input: { startsAt: Date | string; now: Date; hoursBefore: number; timeZone?: string | null }): ReminderTiming {
  const starts = typeof input.startsAt === 'string' ? Date.parse(input.startsAt) : input.startsAt.getTime();
  const minutesLeft = (starts - input.now.getTime()) / 60_000;
  if (!Number.isFinite(minutesLeft) || minutesLeft < MIN_LEAD_MINUTES) return 'too_late';
  if (minutesLeft > input.hoursBefore * 60) return 'wait';
  const local = localParts(input.now, input.timeZone).minutes;
  return local >= QUIET_END_MINUTES && local < QUIET_START_MINUTES ? 'send' : 'wait';
}

export type ReminderReply = 'confirm' | 'reschedule';

const normalizeText = (value: string) => value
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const CONFIRM = new Set([
  '1', 'sim', 's', 'ok', 'confirmo', 'confirmado', 'confirmada', 'confirmar', 'confirma', 'pode confirmar', 'sim confirmo',
  'sim confirmado', 'estarei la', 'vou sim', 'vou', 'pode ser', 'combinado', 'fechado', 'certo', 'beleza', 'blz', 'ta confirmado',
  'esta confirmado', 'confirmadissimo', 'ok confirmado', 'sim pode confirmar', 'tudo certo',
]);
const RESCHEDULE = new Set([
  '2', 'nao', 'n', 'remarcar', 'remarca', 'quero remarcar', 'preciso remarcar', 'desmarcar', 'desmarca', 'quero desmarcar',
  'preciso desmarcar', 'cancelar', 'cancela', 'quero cancelar', 'preciso cancelar', 'nao vou', 'nao posso', 'nao vou poder',
  'nao consigo', 'nao vou conseguir', 'nao posso ir', 'nao vou conseguir ir', 'outro horario', 'outro dia', 'mudar horario',
  'trocar horario', 'reagendar', 'quero reagendar', 'preciso reagendar',
]);

/**
 * Entende a resposta ao lembrete. Só aceita mensagens curtas e diretas: qualquer coisa mais
 * elaborada segue para o atendimento normal (IA ou equipe), para não confirmar por engano.
 */
export function parseReminderReply(text: string | null | undefined): ReminderReply | null {
  const raw = (text ?? '').trim();
  if (!raw || raw.length > 40) return null;
  if (/^(👍|✅|👌)+$/u.test(raw.replace(/[️\u{1F3FB}-\u{1F3FF}\s]/gu, ''))) return 'confirm';
  const clean = normalizeText(raw);
  if (!clean) return null;
  if (CONFIRM.has(clean)) return 'confirm';
  if (RESCHEDULE.has(clean)) return 'reschedule';
  return null;
}

export const CONFIRMED_REPLY = 'Confirmado! Esperamos você {dia} às {hora}. Qualquer mudança, é só avisar por aqui.';
export const RESCHEDULE_REPLY = 'Tudo bem! Nossa equipe vai falar com você por aqui para encontrar um novo horário.';
