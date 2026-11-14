import { describe, expect, it } from 'vitest';
import { processMetaEvent } from './meta-webhook';

type Row = Record<string, any>;
class FakeDb {
  t: Record<string, Row[]> = { channel_connections: [], contacts: [], conversations: [], messages: [] };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  sort: string | null = null;
  max = Infinity;
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  upsert(row: Row) { this.mode = 'upsert'; this.payload = row; return this; }
  eq(column: string, value: any) { this.preds.push(row => row[column] === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => row[column] !== value); return this; }
  order(column: string) { this.sort = column; return this; }
  limit(count: number) { this.max = count; return this; }
  private run(): { data: any; error: any } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') { const row = { id: `${this.table}-${++this.db.n}`, ...this.payload }; rows.push(row); return { data: [row], error: null }; }
    if (this.mode === 'upsert') {
      const key = ['provider', 'provider_message_id'];
      const dup = rows.find(row => key.every(column => row[column] === this.payload[column]));
      if (dup) return { data: [], error: null }; // ignoreDuplicates
      const row = { id: `${this.table}-${++this.db.n}`, ...this.payload }; rows.push(row); return { data: [row], error: null };
    }
    let matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: matched, error: null }; }
    if (this.sort) matched = [...matched].sort((a, b) => (a[this.sort!] < b[this.sort!] ? 1 : -1));
    return { data: matched.slice(0, this.max), error: null };
  }
  maybeSingle() { const result = this.run(); return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

function seed() {
  const db = new FakeDb();
  db.t.channel_connections.push({ id: 'conn-1', organization_id: 'org-1', channel: 'instagram', provider_account_id: 'ig-page-1' });
  return db;
}
const event = (overrides: Partial<{ pageId: string; senderId: string; text: string | null; kind: string; mid: string; timestamp: string }> = {}) => ({
  pageId: 'ig-page-1', senderId: 'visitor-1', text: 'Oi, vocês têm horário hoje?', kind: 'text', mid: 'mid-1', timestamp: '2026-11-14T12:00:00.000Z', ...overrides,
});

describe('processMetaEvent', () => {
  it('cria contato e conversa na primeira mensagem', async () => {
    const db = seed();
    const result = await processMetaEvent(db as any, 'instagram', event());
    expect(result).toEqual({ handled: true });
    expect(db.t.contacts[0]).toMatchObject({ organization_id: 'org-1', full_name: 'Contato do Instagram', external_id: 'instagram:visitor-1' });
    expect(db.t.conversations[0]).toMatchObject({ organization_id: 'org-1', channel: 'instagram', ai_mode: 'off', unread_count: 1 });
    expect(db.t.messages[0]).toMatchObject({ direction: 'inbound', body: 'Oi, vocês têm horário hoje?', provider: 'instagram', provider_message_id: 'mid-1' });
  });

  it('reaproveita o contato e a conversa na segunda mensagem', async () => {
    const db = seed();
    await processMetaEvent(db as any, 'instagram', event());
    await processMetaEvent(db as any, 'instagram', event({ mid: 'mid-2', text: 'Alguém aí?' }));
    expect(db.t.contacts).toHaveLength(1);
    expect(db.t.conversations).toHaveLength(1);
    expect(db.t.conversations[0]!.unread_count).toBe(2);
    expect(db.t.messages).toHaveLength(2);
  });

  it('não grava a mesma mensagem duas vezes (reentrega do webhook)', async () => {
    const db = seed();
    await processMetaEvent(db as any, 'instagram', event());
    const second = await processMetaEvent(db as any, 'instagram', event());
    expect(second).toEqual({ handled: true, reason: 'duplicate' });
    expect(db.t.messages).toHaveLength(1);
  });

  it('reconhece sem gravar quando a página não está conectada a nenhuma empresa', async () => {
    const db = seed();
    const result = await processMetaEvent(db as any, 'instagram', event({ pageId: 'outra-pagina' }));
    expect(result).toEqual({ handled: false, reason: 'connection_not_found' });
    expect(db.t.contacts).toHaveLength(0);
  });

  it('separa contatos do Instagram e do Messenger mesmo com o mesmo id de remetente', async () => {
    const db = seed();
    db.t.channel_connections.push({ id: 'conn-2', organization_id: 'org-1', channel: 'messenger', provider_account_id: 'fb-page-1' });
    await processMetaEvent(db as any, 'instagram', event());
    await processMetaEvent(db as any, 'messenger', event({ pageId: 'fb-page-1', mid: 'mid-fb-1' }));
    expect(db.t.contacts).toHaveLength(2);
    expect(db.t.contacts.map(c => c.external_id)).toEqual(['instagram:visitor-1', 'messenger:visitor-1']);
  });
});
