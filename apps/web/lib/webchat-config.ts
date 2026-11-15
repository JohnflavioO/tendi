/**
 * Webchat: botões do chat (falar com atendente, encerrar, respostas rápidas) e fila de atendimento.
 * Funções puras, usadas pela tela de configuração, pelas rotas públicas e pelos testes.
 */

export const MAX_QUICK_REPLIES = 4;
export const MAX_BUTTON_LABEL = 28;
export const MAX_QUICK_TEXT = 300;
export const MAX_NOTICE = 200;

export type QuickReply = { label: string; text: string };
export type WebchatSettings = {
  handoffButton: { enabled: boolean; label: string };
  endButton: { enabled: boolean; label: string };
  quickReplies: QuickReply[];
  queue: { enabled: boolean; showPosition: boolean; message: string };
  endMessage: string;
  form: WebchatForm;
};

/** Campo do formulário de identificação: obrigatório, opcional ou não pedir. */
export type FieldRule = 'required' | 'optional' | 'hidden';
export type WebchatForm = { enabled: boolean; title: string; phone: FieldRule; email: FieldRule };

export const DEFAULT_WEBCHAT_SETTINGS: WebchatSettings = {
  handoffButton: { enabled: true, label: 'Falar com atendente' },
  endButton: { enabled: true, label: 'Encerrar atendimento' },
  quickReplies: [],
  queue: { enabled: true, showPosition: true, message: 'Um atendente vai continuar com você em instantes.' },
  endMessage: 'Atendimento encerrado. Obrigado pelo contato!',
  form: { enabled: true, title: 'Antes de começar, como podemos te chamar?', phone: 'required', email: 'optional' },
};

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const rule = (value: unknown, fallback: FieldRule): FieldRule => (value === 'required' || value === 'optional' || value === 'hidden' ? value : fallback);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Lê o que está no banco (jsonb) e completa com os padrões. Texto vazio volta ao padrão. */
export function normalizeWebchatSettings(raw: unknown): WebchatSettings {
  const value = obj(raw);
  const handoff = obj(value.handoffButton);
  const end = obj(value.endButton);
  const queue = obj(value.queue);
  const form = obj(value.form);
  const seen = new Set<string>();
  const quickReplies = (Array.isArray(value.quickReplies) ? value.quickReplies : [])
    .map(item => ({ label: clean(obj(item).label, MAX_BUTTON_LABEL), text: clean(obj(item).text, MAX_QUICK_TEXT) }))
    .map(item => ({ ...item, text: item.text || item.label }))
    .filter(item => item.label && !seen.has(item.label.toLowerCase()) && seen.add(item.label.toLowerCase()))
    .slice(0, MAX_QUICK_REPLIES);
  const d = DEFAULT_WEBCHAT_SETTINGS;
  return {
    handoffButton: { enabled: bool(handoff.enabled, d.handoffButton.enabled), label: clean(handoff.label, MAX_BUTTON_LABEL) || d.handoffButton.label },
    endButton: { enabled: bool(end.enabled, d.endButton.enabled), label: clean(end.label, MAX_BUTTON_LABEL) || d.endButton.label },
    quickReplies,
    queue: {
      enabled: bool(queue.enabled, d.queue.enabled),
      showPosition: bool(queue.showPosition, d.queue.showPosition),
      message: clean(queue.message, MAX_NOTICE) || d.queue.message,
    },
    endMessage: clean(value.endMessage, MAX_NOTICE) || d.endMessage,
    form: {
      enabled: bool(form.enabled, d.form.enabled),
      title: clean(form.title, MAX_NOTICE) || d.form.title,
      phone: rule(form.phone, d.form.phone),
      email: rule(form.email, d.form.email),
    },
  };
}

/** O que o visitante vê sobre o andamento do atendimento. */
export type WebchatState =
  | { mode: 'ai' }
  | { mode: 'human' }
  | { mode: 'queue'; position: number | null; inHours: boolean; message: string }
  | { mode: 'closed'; message: string };

export function webchatState(input: {
  conversation: { status: string; ai_mode: string | null; assigned_to: string | null };
  settings: WebchatSettings;
  /** Posição na fila (1 = próximo), ou null quando não deu para calcular. */
  position: number | null;
  inHours: boolean;
  hoursText: string;
}): WebchatState {
  const { conversation, settings } = input;
  if (conversation.status === 'closed') return { mode: 'closed', message: settings.endMessage };
  if (conversation.assigned_to) return { mode: 'human' };
  if (conversation.ai_mode === 'on') return { mode: 'ai' };
  if (!settings.queue.enabled) return { mode: 'human' };
  const message = input.inHours
    ? settings.queue.message
    : `Nossa equipe atende ${input.hoursText}. Sua mensagem fica registrada e você será respondido no próximo horário.`;
  return { mode: 'queue', position: input.inHours && settings.queue.showPosition ? input.position : null, inHours: input.inHours, message };
}

/** "Você é o próximo" / "Você é o 3º na fila". */
export function queueLabel(position: number | null): string {
  if (!position || position < 1) return 'Você está na fila de atendimento';
  return position === 1 ? 'Você é o próximo a ser atendido' : `Você é o ${position}º na fila`;
}

// ---------- Identificação do visitante (formulário antes da conversa) ----------

export const MAX_VISITOR_NAME = 80;
export const MAX_VISITOR_EMAIL = 120;
export type VisitorIdentity = { name: string; phone: string | null; email: string | null };

/** Telefone do Brasil ou internacional: só dígitos com DDI. "(85) 99999-0000" -> "+5585999990000". */
export function normalizeVisitorPhone(raw: unknown): string | null {
  const digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  if (!digits) return null;
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return full.length >= 12 && full.length <= 15 ? `+${full}` : null;
}

/** Confere o formulário conforme a configuração da empresa. Devolve os dados limpos ou a mensagem para o visitante. */
export function checkVisitorIdentity(raw: unknown, form: WebchatForm): { ok: true; identity: VisitorIdentity } | { ok: false; error: string } {
  const input = obj(raw);
  const name = clean(input.name, MAX_VISITOR_NAME);
  if (name.replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Informe seu nome.' };
  const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : '';
  const phone = form.phone === 'hidden' ? null : normalizeVisitorPhone(phoneRaw);
  if (form.phone !== 'hidden' && phoneRaw && !phone) return { ok: false, error: 'Telefone inválido. Use DDD + número, ex.: (85) 99999-0000.' };
  if (form.phone === 'required' && !phone) return { ok: false, error: 'Informe seu WhatsApp com DDD.' };
  const emailRaw = form.email === 'hidden' ? '' : clean(input.email, MAX_VISITOR_EMAIL).toLowerCase();
  const email = emailRaw || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'E-mail inválido.' };
  if (form.email === 'required' && !email) return { ok: false, error: 'Informe seu e-mail.' };
  return { ok: true, identity: { name, phone, email } };
}
