import { describe, expect, it, vi } from 'vitest';
import { notifyAppointmentChange } from './agenda-notify-server';

type Row = Record<string, any>;

/** Banco em memória com o mínimo usado pelo aviso de cancelamento/remarcação. */
class FakeDb {
  t: Record<string, Row[]> = { channel_connections: [], contacts: [], conversations: [], messages: [] };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode: 'select' | 'insert' | 'update' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(column: string, value: any) { this.preds.push(row => row[column] === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => row[column] !== value); return this; }
  order() { return this; }
  limit() { return this; }
  private run(): { data: any; error: any } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') {
      const row = { id: `${this.table}-${++this.db.n}`, ...this.payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    const matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: matched, error: null }; }
    return { data: matched, error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

const ORG = 'org-1';
const input = (extra: Row = {}) => ({
  appointmentId: 'appt-1', organizationId: ORG, organizationName: 'Barbearia Central', timeZone: 'America/Sao_Paulo',
  professionalName: 'Rafael', customerName: 'João Pedro', customerPhone: '+5585999990000',
  contactId: null, conversationId: null, startsAt: '2026-11-14T13:30:00Z', action: 'cancelled' as const,
  ...extra,
});

function connected(db: FakeDb) {
  db.t.channel_connections.push({ organization_id: ORG, channel: 'whatsapp', provider_account_id: 'tendi-org-1', status: 'connected' });
}

describe('notifyAppointmentChange', () => {
  it('avisa o cancelamento, criando contato e conversa quando faltam', async () => {
    const db = new FakeDb();
    connected(db);
    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await notifyAppointmentChange(db as any, input(), send);
    expect(result).toEqual({ ok: true });
    expect(db.t.contacts[0]).toMatchObject({ organization_id: ORG, phone_e164: '+5585999990000' });
    expect(db.t.conversations[0]).toMatchObject({ organization_id: ORG, channel: 'whatsapp' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1].text).toContain('foi cancelado');
    expect(send.mock.calls[0]![1].to).toBe('5585999990000');
  });

  it('avisa a remarcação com o novo horário', async () => {
    const db = new FakeDb();
    connected(db);
    const send = vi.fn().mockResolvedValue({ ok: true });
    await notifyAppointmentChange(db as any, input({ action: 'rescheduled', startsAt: '2026-11-15T16:00:00Z' }), send);
    expect(send.mock.calls[0]![1].text).toContain('foi remarcado para');
    expect(send.mock.calls[0]![1].text).toContain('13:00');
  });

  it('não envia sem telefone do cliente', async () => {
    const db = new FakeDb();
    connected(db);
    const send = vi.fn();
    const result = await notifyAppointmentChange(db as any, input({ customerPhone: null }), send);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it('não envia sem WhatsApp conectado', async () => {
    const db = new FakeDb();
    const send = vi.fn();
    const result = await notifyAppointmentChange(db as any, input(), send);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(send).not.toHaveBeenCalled();
  });

  it('reaproveita contato e conversa já existentes', async () => {
    const db = new FakeDb();
    connected(db);
    const send = vi.fn().mockResolvedValue({ ok: true });
    await notifyAppointmentChange(db as any, input({ contactId: 'contact-9', conversationId: 'conv-9' }), send);
    expect(db.t.contacts).toHaveLength(0);
    expect(db.t.conversations).toHaveLength(0);
    expect(db.t.messages[0]).toMatchObject({ conversation_id: 'conv-9' });
  });
});
