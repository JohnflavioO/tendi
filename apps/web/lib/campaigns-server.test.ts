import { describe, expect, it, vi } from 'vitest';
import { createCampaign, runCampaignBatch } from './campaigns-server';

type Row = Record<string, any>;

/** Banco em memória com o mínimo do construtor de consultas do Supabase usado pelas campanhas. */
class FakeDb {
  t: Record<string, Row[]> = { contacts: [], campaigns: [], campaign_recipients: [], channel_connections: [], conversations: [], messages: [] };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  max = Infinity;
  countHead = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_columns?: string, opts?: { count?: string; head?: boolean }) { this.countHead = !!opts?.head; return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(column: string, value: any) { this.preds.push(row => row[column] === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => row[column] !== value); return this; }
  not(column: string, _op: string, _value: any) { this.preds.push(row => row[column] !== null && row[column] !== undefined); return this; }
  contains(column: string, values: any[]) { this.preds.push(row => Array.isArray(row[column]) && values.every(v => row[column].includes(v))); return this; }
  order() { return this; }
  limit(count: number) { this.max = count; return this; }
  private run(): { data: any; error: any; count: number } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = payloads.map(p => ({ id: `${this.table}-${++this.db.n}`, created_at: new Date().toISOString(), ...p }));
      rows.push(...inserted);
      return { data: inserted, error: null, count: 0 };
    }
    let matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: matched, error: null, count: 0 }; }
    if (this.mode === 'delete') { this.db.t[this.table] = rows.filter(row => !matched.includes(row)); return { data: matched, error: null, count: 0 }; }
    matched = matched.slice(0, this.max);
    return { data: matched, error: null, count: matched.length };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) {
    const result = this.run();
    return Promise.resolve(this.countHead ? { data: null, error: result.error, count: result.count } : result).then(resolve, reject);
  }
}

const ORG = 'org-1';

function seed(overrides: { connection?: Row | null } = {}) {
  const db = new FakeDb();
  db.t.contacts.push(
    { id: 'c1', organization_id: ORG, full_name: 'Maria Souza', phone_e164: '+5585999990001', tags: ['agendar'], opt_in: true },
    { id: 'c2', organization_id: ORG, full_name: 'João Pedro', phone_e164: '+5585999990002', tags: ['agendar'], opt_in: false },
    { id: 'c3', organization_id: ORG, full_name: 'Ana Lima', phone_e164: '+5585999990003', tags: ['vip'], opt_in: true },
    { id: 'c4', organization_id: ORG, full_name: 'Sem telefone', phone_e164: null, tags: ['agendar'], opt_in: true },
  );
  if (overrides.connection !== null) db.t.channel_connections.push({ organization_id: ORG, channel: 'whatsapp', provider_account_id: 'tendi-org-1', status: 'connected', ...overrides.connection });
  return db;
}

describe('createCampaign', () => {
  it('registra só os contatos do segmento com opt-in e telefone', async () => {
    const db = seed();
    const result = await createCampaign(db as any, { organizationId: ORG, name: 'Promo de verão', message: 'Olá, {nome}!', tag: 'agendar', createdBy: 'user-1' });
    expect(result).toMatchObject({ ok: true, totalRecipients: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(db.t.campaigns[0]).toMatchObject({ id: result.campaignId, name: 'Promo de verão', tag: 'agendar', status: 'sending', total_recipients: 1 });
    expect(db.t.campaign_recipients).toHaveLength(1);
    expect(db.t.campaign_recipients[0]).toMatchObject({ contact_id: 'c1', phone: '+5585999990001', status: 'pending' });
  });

  it('recusa quando ninguém do segmento tem opt-in', async () => {
    const db = seed();
    const result = await createCampaign(db as any, { organizationId: ORG, name: 'Promo', message: 'Oi', tag: 'vip-sem-optin', createdBy: null });
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(db.t.campaigns).toHaveLength(0);
  });

  it('valida campos obrigatórios', async () => {
    const db = seed();
    expect(await createCampaign(db as any, { organizationId: ORG, name: '', message: 'Oi', tag: 'agendar', createdBy: null })).toMatchObject({ ok: false, status: 400 });
    expect(await createCampaign(db as any, { organizationId: ORG, name: 'Promo', message: '', tag: 'agendar', createdBy: null })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('runCampaignBatch', () => {
  function withCampaign() {
    const db = seed();
    db.t.campaigns.push({ id: 'camp-1', organization_id: ORG, message: 'Oi, {nome}! Promoção especial.', status: 'sending', total_recipients: 2, sent_count: 0, failed_count: 0 });
    db.t.campaign_recipients.push(
      { id: 'r1', campaign_id: 'camp-1', organization_id: ORG, contact_id: 'c1', customer_name: 'Maria Souza', phone: '+5585999990001', status: 'pending' },
      { id: 'r2', campaign_id: 'camp-1', organization_id: ORG, contact_id: 'c3', customer_name: 'Ana Lima', phone: '+5585999990003', status: 'pending' },
    );
    return db;
  }

  it('envia os destinatários pendentes e marca a campanha como concluída', async () => {
    const db = withCampaign();
    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await runCampaignBatch(db as any, { send, sleep: () => Promise.resolve() });
    expect(result).toMatchObject({ campaigns: 1, sent: 2, failed: 0, completed: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1].text).toBe('Oi, Maria! Promoção especial.');
    expect(db.t.campaign_recipients.every(r => r.status === 'sent')).toBe(true);
    expect(db.t.campaigns[0]).toMatchObject({ status: 'completed', sent_count: 2 });
  });

  it('marca falha no envio sem travar os outros destinatários', async () => {
    const db = withCampaign();
    const send = vi.fn().mockRejectedValueOnce(new Error('session not found')).mockResolvedValueOnce({ ok: true });
    const result = await runCampaignBatch(db as any, { send, sleep: () => Promise.resolve() });
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(db.t.campaign_recipients.find(r => r.id === 'r1')).toMatchObject({ status: 'failed', error: 'session not found' });
    expect(db.t.campaign_recipients.find(r => r.id === 'r2')).toMatchObject({ status: 'sent' });
    expect(db.t.campaigns[0]).toMatchObject({ status: 'completed', sent_count: 1, failed_count: 1 });
  });

  it('não envia sem WhatsApp conectado (tenta de novo depois)', async () => {
    const db = seed({ connection: null });
    db.t.campaigns.push({ id: 'camp-1', organization_id: ORG, message: 'Oi', status: 'sending', total_recipients: 1, sent_count: 0, failed_count: 0 });
    db.t.campaign_recipients.push({ id: 'r1', campaign_id: 'camp-1', organization_id: ORG, contact_id: 'c1', customer_name: 'Maria Souza', phone: '+5585999990001', status: 'pending' });
    const send = vi.fn();
    const result = await runCampaignBatch(db as any, { send, sleep: () => Promise.resolve() });
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(db.t.campaign_recipients[0]!.status).toBe('pending');
  });
});
