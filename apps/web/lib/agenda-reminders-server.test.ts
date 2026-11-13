import { describe, expect, it, vi } from 'vitest';
import { handleReminderReply, runAgendaReminders } from './agenda-reminders-server';

type Row = Record<string, any>;

/** Banco em memória com o mínimo do construtor de consultas do Supabase usado pelos lembretes. */
class FakeDb {
  t: Record<string, Row[]> = { organizations: [], appointments: [], agenda_professionals: [], channel_connections: [], contacts: [], conversations: [], messages: [], ai_agents: [] };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
const pick = (row: Row, column: string): unknown => {
  // "agenda_settings->reminders->>enabled": caminho em JSON, com o último nível como texto.
  if (!column.includes('->')) return row[column];
  const parts = column.split(/->>?/);
  let value: any = row[parts[0]!];
  for (const part of parts.slice(1)) value = value?.[part];
  return column.includes('->>') && value !== undefined && value !== null ? String(value) : value;
};
class Query {
  mode: 'select' | 'insert' | 'update' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  sort: string | null = null;
  max = Infinity;
  returning = false;
  constructor(private db: FakeDb, private table: string) {}
  select() { this.returning = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(column: string, value: any) { this.preds.push(row => pick(row, column) === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => pick(row, column) !== value); return this; }
  is(column: string, value: any) { this.preds.push(row => (row[column] ?? null) === value); return this; }
  not(column: string, _op: string, value: any) { this.preds.push(row => (row[column] ?? null) !== value); return this; }
  gt(column: string, value: any) { this.preds.push(row => row[column] > value); return this; }
  gte(column: string, value: any) { this.preds.push(row => row[column] >= value); return this; }
  lte(column: string, value: any) { this.preds.push(row => row[column] <= value); return this; }
  in(column: string, values: any[]) { this.preds.push(row => values.includes(row[column])); return this; }
  order(column: string) { this.sort = column; return this; }
  limit(count: number) { this.max = count; return this; }
  private run(): { data: any; error: any } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') {
      const row = { id: `${this.table}-${++this.db.n}`, ...this.payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    let matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') {
      matched.forEach(row => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }
    if (this.sort) matched = [...matched].sort((a, b) => (a[this.sort!] < b[this.sort!] ? -1 : a[this.sort!] > b[this.sort!] ? 1 : 0));
    return { data: matched.slice(0, this.max), error: null };
  }
  maybeSingle() { const result = this.run(); return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

const ORG = 'org-1';
// 13/11/2026, 12:00 em São Paulo.
const NOW = new Date('2026-11-13T15:00:00Z');
const deps = (send = vi.fn().mockResolvedValue({ ok: true })) => ({ send, now: () => NOW, sleep: () => Promise.resolve() });

function seed(overrides: { reminders?: Row; org?: Row; connection?: Row | null } = {}) {
  const db = new FakeDb();
  db.t.organizations.push({ id: ORG, name: 'Barbearia Central', status: 'active', trial_ends_at: null, timezone: 'America/Sao_Paulo', agenda_settings: { reminders: { enabled: true, hoursBefore: 24, ...overrides.reminders } }, ...overrides.org });
  db.t.agenda_professionals.push({ id: 'prof-1', name: 'Rafael' });
  if (overrides.connection !== null) db.t.channel_connections.push({ organization_id: ORG, channel: 'whatsapp', provider_account_id: 'tendi-org-1', status: 'connected', ...overrides.connection });
  return db;
}
const appointment = (extra: Row = {}): Row => ({
  id: 'appt-1', organization_id: ORG, professional_id: 'prof-1', contact_id: null, conversation_id: null, customer_name: 'João Pedro',
  customer_phone: '+5585999990000', service_name: 'Corte', starts_at: '2026-11-14T13:30:00Z', status: 'scheduled',
  reminder_sent_at: null, reminder_status: null, reminder_reply: null, ...extra,
});

describe('envio dos lembretes', () => {
  it('envia uma vez, registra no Inbox e marca o agendamento', async () => {
    const db = seed();
    db.t.appointments.push(appointment());
    const send = vi.fn().mockResolvedValue({ ok: true });

    const first = await runAgendaReminders(db as any, deps(send));
    expect(first).toMatchObject({ organizations: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [path, body] = send.mock.calls[0]!;
    expect(path).toBe('/messages/send/text');
    expect(body).toMatchObject({ sessionId: 'tendi-org-1', to: '5585999990000' });
    expect(body.text).toContain('Olá, João!');
    expect(body.text).toContain('Corte com Rafael, amanhã às 10:30');

    const saved = db.t.appointments[0]!;
    expect(saved).toMatchObject({ reminder_status: 'sent', reminder_error: null });
    expect(saved.contact_id).toBeTruthy();
    expect(saved.conversation_id).toBeTruthy();
    expect(db.t.messages[0]).toMatchObject({ direction: 'outbound', delivery_status: 'sent', payload: { kind: 'reminder', sender: { type: 'system' } } });

    // Segunda execução: nada novo é enviado.
    const second = await runAgendaReminders(db as any, deps(send));
    expect(second.sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('não envia com o recurso desligado', async () => {
    const db = seed({ reminders: { enabled: false } });
    db.t.appointments.push(appointment());
    const send = vi.fn();
    expect(await runAgendaReminders(db as any, deps(send))).toMatchObject({ organizations: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('ignora quem não tem WhatsApp, já confirmou, cancelou ou está longe demais', async () => {
    const db = seed();
    db.t.appointments.push(
      appointment({ id: 'a', customer_phone: null }),
      appointment({ id: 'b', status: 'confirmed' }),
      appointment({ id: 'c', status: 'cancelled' }),
      appointment({ id: 'd', starts_at: '2026-11-16T13:00:00Z' }),
      appointment({ id: 'e', starts_at: '2026-11-13T15:20:00Z' }),
    );
    const send = vi.fn();
    expect((await runAgendaReminders(db as any, deps(send))).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(db.t.appointments.every(item => item.reminder_sent_at === null)).toBe(true);
  });

  it('não envia em horário de silêncio', async () => {
    const db = seed();
    db.t.appointments.push(appointment({ starts_at: '2026-11-14T18:00:00Z' }));
    const send = vi.fn();
    const night = { ...deps(send), now: () => new Date('2026-11-14T02:00:00Z') };
    expect((await runAgendaReminders(db as any, night)).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('não envia sem WhatsApp conectado nem para empresa suspensa ou com teste vencido', async () => {
    const send = vi.fn();
    const disconnected = seed({ connection: { status: 'disconnected' } });
    disconnected.t.appointments.push(appointment());
    expect(await runAgendaReminders(disconnected as any, deps(send))).toMatchObject({ sent: 0, skipped: 1 });
    expect(disconnected.t.appointments[0]!.reminder_sent_at).toBeNull();

    const suspended = seed({ org: { status: 'suspended' } });
    suspended.t.appointments.push(appointment());
    expect((await runAgendaReminders(suspended as any, deps(send))).organizations).toBe(0);

    const expired = seed({ org: { status: 'trial', trial_ends_at: '2026-11-01T00:00:00Z' } });
    expired.t.appointments.push(appointment());
    expect((await runAgendaReminders(expired as any, deps(send))).organizations).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('marca a falha e não tenta de novo', async () => {
    const db = seed();
    db.t.appointments.push(appointment());
    const send = vi.fn().mockRejectedValue(new Error('session not found'));
    expect(await runAgendaReminders(db as any, deps(send))).toMatchObject({ sent: 0, failed: 1 });
    expect(db.t.appointments[0]).toMatchObject({ reminder_status: 'failed', reminder_error: 'session not found' });
    expect(db.t.messages[0]!.delivery_status).toBe('failed');
    await runAgendaReminders(db as any, deps(send));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('usa o texto configurado pela empresa', async () => {
    const db = seed({ reminders: { template: 'Oi {nome}, te espero {dia} às {hora}. 1 confirma, 2 remarca.' } });
    db.t.appointments.push(appointment());
    const send = vi.fn().mockResolvedValue({});
    await runAgendaReminders(db as any, deps(send));
    expect(send.mock.calls[0]![1].text).toBe('Oi João, te espero amanhã às 10:30. 1 confirma, 2 remarca.');
  });
});

describe('resposta do cliente ao lembrete', () => {
  function reminded() {
    const db = seed();
    db.t.contacts.push({ id: 'contact-1', organization_id: ORG, phone_e164: '+5585999990000', full_name: 'João Pedro' });
    db.t.conversations.push({ id: 'conv-1', organization_id: ORG, contact_id: 'contact-1', channel: 'whatsapp', status: 'open', ai_mode: 'on' });
    db.t.appointments.push(appointment({ contact_id: 'contact-1', conversation_id: 'conv-1', reminder_sent_at: '2026-11-13T14:00:00Z', reminder_status: 'sent' }));
    return db;
  }
  const input = (text: string) => ({ organizationId: ORG, contactId: 'contact-1', conversationId: 'conv-1', text });

  it('"1" confirma o agendamento e agradece', async () => {
    const db = reminded();
    const send = vi.fn().mockResolvedValue({});
    const outcome = await handleReminderReply(db as any, input('1'), { send, now: () => NOW });
    expect(outcome).toEqual({ handled: true, action: 'confirmed', appointmentId: 'appt-1' });
    expect(db.t.appointments[0]).toMatchObject({ status: 'confirmed', reminder_reply: 'confirmed' });
    expect(send.mock.calls[0]![1].text).toBe('Confirmado! Esperamos você amanhã às 10:30. Qualquer mudança, é só avisar por aqui.');
    expect(db.t.conversations[0]!.ai_mode).toBe('on');
  });

  it('"2" mantém o horário, avisa a equipe e tira a IA da conversa', async () => {
    const db = reminded();
    const send = vi.fn().mockResolvedValue({});
    const outcome = await handleReminderReply(db as any, input('preciso remarcar'), { send, now: () => NOW });
    expect(outcome).toMatchObject({ handled: true, action: 'reschedule' });
    expect(db.t.appointments[0]).toMatchObject({ status: 'scheduled', reminder_reply: 'reschedule' });
    expect(db.t.appointments[0]!.reschedule_requested_at).toBeTruthy();
    expect(db.t.conversations[0]).toMatchObject({ ai_mode: 'handoff', status: 'open' });
    const note = db.t.messages.find(message => message.direction === 'internal');
    expect(note?.body).toContain('pediu para remarcar o horário de amanhã às 10:30');
    expect(send.mock.calls[0]![1].text).toContain('Nossa equipe vai falar com você');
  });

  it('não trata mensagens que não são resposta direta', async () => {
    const db = reminded();
    const send = vi.fn();
    expect(await handleReminderReply(db as any, input('qual o endereço?'), { send, now: () => NOW })).toEqual({ handled: false });
    expect(db.t.appointments[0]!.status).toBe('scheduled');
    expect(send).not.toHaveBeenCalled();
  });

  it('não trata "1" quando não há lembrete pendente', async () => {
    const send = vi.fn();
    const noReminder = reminded();
    noReminder.t.appointments[0]!.reminder_status = null;
    expect((await handleReminderReply(noReminder as any, input('1'), { send, now: () => NOW })).handled).toBe(false);

    const old = reminded();
    old.t.appointments[0]!.reminder_sent_at = '2026-11-09T14:00:00Z';
    expect((await handleReminderReply(old as any, input('1'), { send, now: () => NOW })).handled).toBe(false);

    const past = reminded();
    past.t.appointments[0]!.starts_at = '2026-11-13T12:00:00Z';
    expect((await handleReminderReply(past as any, input('1'), { send, now: () => NOW })).handled).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('vale só a primeira resposta', async () => {
    const db = reminded();
    const send = vi.fn().mockResolvedValue({});
    await handleReminderReply(db as any, input('1'), { send, now: () => NOW });
    const again = await handleReminderReply(db as any, input('2'), { send, now: () => NOW });
    expect(again.handled).toBe(false);
    expect(db.t.appointments[0]).toMatchObject({ status: 'confirmed', reminder_reply: 'confirmed' });
  });
});
