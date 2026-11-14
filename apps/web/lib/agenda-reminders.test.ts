import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_TEMPLATE, normalizeReminderSettings, parseReminderReply, reminderDayLabel, reminderTiming, reminderVars,
  renderReminder,
} from './agenda-reminders';

const TZ = 'America/Sao_Paulo';
// 13/11/2026 é sexta-feira. 15:00 UTC = 12:00 em São Paulo.
const noon = new Date('2026-11-13T15:00:00Z');

describe('configuração dos lembretes', () => {
  it('vem desligada por padrão', () => {
    expect(normalizeReminderSettings(null)).toEqual({ enabled: false, hoursBefore: 24, template: DEFAULT_REMINDER_TEMPLATE });
    expect(normalizeReminderSettings({}).enabled).toBe(false);
    expect(normalizeReminderSettings({ reminders: { enabled: 'true' } }).enabled).toBe(false);
  });
  it('aceita só as antecedências oferecidas', () => {
    expect(normalizeReminderSettings({ reminders: { enabled: true, hoursBefore: 4 } })).toMatchObject({ enabled: true, hoursBefore: 4 });
    expect(normalizeReminderSettings({ reminders: { hoursBefore: 7 } }).hoursBefore).toBe(24);
    expect(normalizeReminderSettings({ reminders: { hoursBefore: 'abc' } }).hoursBefore).toBe(24);
  });
  it('usa o texto padrão quando o texto está vazio e corta textos longos', () => {
    expect(normalizeReminderSettings({ reminders: { template: '   ' } }).template).toBe(DEFAULT_REMINDER_TEMPLATE);
    expect(normalizeReminderSettings({ reminders: { template: 'x'.repeat(2000) } }).template).toHaveLength(700);
  });
});

describe('texto do lembrete', () => {
  it('preenche as variáveis', () => {
    const vars = reminderVars({ customerName: 'João Pedro Silva', organizationName: 'Barbearia Central', serviceName: 'Corte', professionalName: 'Rafael', startsAt: '2026-11-14T13:30:00Z', now: noon, timeZone: TZ });
    expect(vars).toEqual({ nome: 'João', empresa: 'Barbearia Central', servico: 'Corte', profissional: 'Rafael', dia: 'amanhã', hora: '10:30' });
    expect(renderReminder('Oi {nome}, {servico} com {profissional} {dia} às {hora} na {empresa}. {outra}', vars))
      .toBe('Oi João, Corte com Rafael amanhã às 10:30 na Barbearia Central. {outra}');
  });
  it('não quebra sem serviço ou sem nome', () => {
    const vars = reminderVars({ customerName: '  ', organizationName: 'Clínica', serviceName: null, professionalName: 'Dra. Ana', startsAt: '2026-11-13T20:00:00Z', now: noon, timeZone: TZ });
    expect(vars.nome).toBe('cliente');
    expect(vars.servico).toBe('seu atendimento');
    expect(vars.dia).toBe('hoje');
  });
  it('escreve o dia por extenso para datas mais distantes', () => {
    expect(reminderDayLabel('2026-11-16T13:00:00Z', noon, TZ)).toBe('segunda-feira, 16/11');
  });
});

describe('momento de enviar', () => {
  const base = { now: noon, hoursBefore: 24, timeZone: TZ };
  it('espera enquanto falta mais que a antecedência', () => {
    expect(reminderTiming({ ...base, startsAt: '2026-11-14T15:30:00Z' })).toBe('wait');
  });
  it('envia dentro da antecedência', () => {
    expect(reminderTiming({ ...base, startsAt: '2026-11-14T15:00:00Z' })).toBe('send');
    expect(reminderTiming({ ...base, startsAt: '2026-11-13T18:00:00Z' })).toBe('send');
  });
  it('não envia em cima da hora nem depois do horário', () => {
    expect(reminderTiming({ ...base, startsAt: '2026-11-13T15:30:00Z' })).toBe('too_late');
    expect(reminderTiming({ ...base, startsAt: '2026-11-13T14:00:00Z' })).toBe('too_late');
    expect(reminderTiming({ ...base, startsAt: 'data-invalida' })).toBe('too_late');
  });
  it('respeita o silêncio das 21h às 8h no fuso da empresa', () => {
    const night = new Date('2026-11-14T02:00:00Z'); // 23:00 em São Paulo
    const early = new Date('2026-11-14T10:59:00Z'); // 07:59
    const morning = new Date('2026-11-14T11:00:00Z'); // 08:00
    const startsAt = '2026-11-14T18:00:00Z';
    expect(reminderTiming({ startsAt, now: night, hoursBefore: 24, timeZone: TZ })).toBe('wait');
    expect(reminderTiming({ startsAt, now: early, hoursBefore: 24, timeZone: TZ })).toBe('wait');
    expect(reminderTiming({ startsAt, now: morning, hoursBefore: 24, timeZone: TZ })).toBe('send');
  });
});

describe('resposta do cliente', () => {
  it.each(['1', 'Sim', 'SIM!', 'confirmo', 'Confirmado ✅', 'ok', 'Pode confirmar', 'Tá confirmado', 'beleza', '👍', '👍🏽', ' 1 '])('entende "%s" como confirmação', text => {
    expect(parseReminderReply(text)).toBe('confirm');
  });
  it.each(['2', 'Não', 'nao vou poder', 'Preciso remarcar', 'quero desmarcar', 'cancelar', 'Não posso ir', 'reagendar'])('entende "%s" como pedido de remarcação', text => {
    expect(parseReminderReply(text)).toBe('reschedule');
  });
  it.each([
    '', null, undefined, '3', 'oi', 'qual o endereço?', 'sim, mas posso chegar 10 minutos atrasado?',
    'não sei ainda', 'quanto custa?', '12', 'confirmo sim, e queria marcar também para o meu filho na quinta',
  ])('não decide sozinho em "%s"', text => {
    expect(parseReminderReply(text as never)).toBeNull();
  });
});
