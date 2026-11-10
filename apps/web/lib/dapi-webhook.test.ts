import { describe, expect, it, vi } from 'vitest';
import { jidToPhone, mapMessageType, parseTimestamp, processDapiEvent } from './dapi-webhook';

// Banco em memória que imita só o que o webhook usa do Supabase.
type Row = Record<string, any>;
const UNIQUE: Record<string, string[]> = { contacts: ['organization_id', 'phone_e164'], messages: ['provider', 'provider_message_id'] };
class FakeDb {
  t: Record<string, Row[]> = { channel_connections: [], contacts: [], conversations: [], messages: [], crm_pipelines: [], crm_stages: [], opportunities: [] };
  n = 0;
  failTables = new Set<string>();
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode = 'select'; filters: Array<['eq' | 'neq', string, any]> = []; payload: any; opts: any = {};
  orders: Array<[string, boolean]> = []; max = Infinity;
  constructor(private db: FakeDb, private table: string) {}
  select(_columns?: string) { return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  upsert(row: Row, opts: any) { this.mode = 'upsert'; this.payload = row; this.opts = opts; return this; }
  eq(c: string, v: any) { this.filters.push(['eq', c, v]); return this; }
  neq(c: string, v: any) { this.filters.push(['neq', c, v]); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  private match(r: Row) { return this.filters.every(([op, c, v]) => (op === 'eq' ? r[c] === v : r[c] !== v)); }
  private duplicate(r: Row) { const keys = UNIQUE[this.table]; return keys ? this.db.t[this.table].find(x => keys.every(k => x[k] === r[k])) : undefined; }
  private run(): { data: any; error: any } {
    if (this.db.failTables.has(this.table)) return { data: null, error: { message: `falha em ${this.table}` } };
    const rows = this.db.t[this.table];
    if (this.mode === 'select') {
      let out = rows.filter(r => this.match(r));
      for (const [col, asc] of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => { const x = a[col] ?? ''; const y = b[col] ?? ''; return (x === y ? 0 : x > y ? 1 : -1) * (asc ? 1 : -1); });
      }
      return { data: out.slice(0, this.max), error: null };
    }
    if (this.mode === 'update') { rows.filter(r => this.match(r)).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    const row = { id: `${this.table}-${++this.db.n}`, created_at: new Date(2026, 10, 10, 12, 0, this.db.n).toISOString(), ...(this.table === 'conversations' ? { unread_count: 0 } : {}), ...this.payload };
    if (this.duplicate(row)) {
      if (this.mode === 'upsert' && this.opts?.ignoreDuplicates) return { data: [], error: null };
      return { data: null, error: { message: 'duplicate key', code: '23505' } };
    }
    rows.push(row);
    return { data: [row], error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

const NOW = () => Date.now();
const envelope = (event: string, data: Row, sessionId = 'tendi-x') => ({ event, sessionId, traceId: 'tr1', data });
const text = (id: string, message: string, extra: Row = {}) => ({
  id, type: 'text', message, timestamp: NOW(), fromMe: false, is_group: false,
  from: { jid: '5511999990000@s.whatsapp.net', name: 'João' }, from_name: 'João',
  to: { jid: '558005915338@s.whatsapp.net', name: 'Minha Empresa' }, media_url: null, ...extra,
});

function setup(options: { settings?: Row; crm?: boolean } = {}) {
  const db = new FakeDb();
  db.t.channel_connections.push({ id: 'cc1', organization_id: 'org1', provider_account_id: 'tendi-x', channel: 'whatsapp', status: 'pending', display_name: 'x', settings: options.settings ?? { provider: 'd-api' } });
  if (options.crm !== false) {
    db.t.crm_pipelines.push({ id: 'p-outro', organization_id: 'org1', is_default: false, created_at: '2026-01-01T00:00:00Z' }, { id: 'p1', organization_id: 'org1', is_default: true, created_at: '2026-02-01T00:00:00Z' }, { id: 'p-org2', organization_id: 'org2', is_default: true, created_at: '2026-01-01T00:00:00Z' });
    db.t.crm_stages.push(
      { id: 's-perdido', organization_id: 'org1', pipeline_id: 'p1', name: 'Perdido', position: 5, final_type: 'lost' },
      { id: 's-negociacao', organization_id: 'org1', pipeline_id: 'p1', name: 'Em negociação', position: 3, final_type: 'open' },
      { id: 's-novo', organization_id: 'org1', pipeline_id: 'p1', name: 'Novo lead', position: 0, final_type: 'open' },
      { id: 's-outro', organization_id: 'org1', pipeline_id: 'p-outro', name: 'Outro funil', position: 0, final_type: 'open' },
    );
  }
  return { db, run: (e: ReturnType<typeof envelope>) => processDapiEvent(db as any, e) };
}

describe('messages.received', () => {
  it('cria contato, conversa e mensagem; repetição não duplica nem soma não lidas', async () => {
    const { db, run } = setup();
    expect((await run(envelope('messages.received', text('M1', 'Olá!')))).handled).toBe(true);
    expect(db.t.contacts[0]).toMatchObject({ phone_e164: '+5511999990000', full_name: 'João' });
    expect(db.t.messages[0]).toMatchObject({ direction: 'inbound', delivery_status: 'received', body: 'Olá!', provider: 'd-api' });
    expect(db.t.conversations[0]).toMatchObject({ channel: 'whatsapp', status: 'open', unread_count: 1 });
    expect((await run(envelope('messages.received', text('M1', 'Olá!')))).reason).toBe('duplicate');
    expect(db.t.messages).toHaveLength(1);
    expect(db.t.conversations[0].unread_count).toBe(1);
    await run(envelope('messages.received', text('M2', 'Tudo bem?')));
    expect(db.t.conversations).toHaveLength(1);
    expect(db.t.conversations[0].unread_count).toBe(2);
  });

  it('mensagem enviada pelo celular vira saída na conversa do cliente, sem somar não lidas', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('M1', 'Oi')));
    await run(envelope('messages.received', text('M2', 'do celular', { fromMe: true, from: { jid: '558005915338@s.whatsapp.net' }, to: { jid: '5511999990000@s.whatsapp.net', name: 'João' } })));
    expect(db.t.messages[1]).toMatchObject({ direction: 'outbound', delivery_status: 'sent' });
    expect(db.t.contacts).toHaveLength(1);
    expect(db.t.conversations[0].unread_count).toBe(1);
  });

  it('guarda mídia com tipo, link e metadados', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('M3', '', { type: 'image', media_url: 'https://cdn.x/y.jpg', media_data: { mimetype: 'image/jpeg', caption: 'foto' } })));
    expect(db.t.messages[0]).toMatchObject({ message_type: 'image', body: 'foto' });
    expect(db.t.messages[0].payload).toMatchObject({ media_url: 'https://cdn.x/y.jpg', mimetype: 'image/jpeg' });
  });

  it('ignora reação, grupo e remetente sem número; atualiza texto editado', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('M1', 'Olá')));
    expect((await run(envelope('messages.received', text('R', '👍', { type: 'reaction' })))).reason).toBe('reaction_ignored');
    expect((await run(envelope('messages.received', text('G', 'x', { is_group: true })))).reason).toBe('group_message');
    expect((await run(envelope('messages.received', text('L', 'x', { from: { jid: '1@lid' } })))).reason).toBe('counterpart_without_phone');
    await run(envelope('messages.received', text('E', 'Olá, tudo bem!', { type: 'edited_message', data: { original_message_id: 'M1' } })));
    expect(db.t.messages.find(m => m.provider_message_id === 'M1')?.body).toBe('Olá, tudo bem!');
    expect(db.t.messages).toHaveLength(1);
  });

  it('mensagem antiga (histórico) não soma não lidas', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('OLD', 'antiga', { timestamp: NOW() - 3_600_000 })));
    expect(db.t.conversations[0].unread_count).toBe(0);
  });

  it('sessão desconhecida e eventos não tratados só respondem sem erro', async () => {
    const { run } = setup();
    expect((await run(envelope('messages.received', text('U', 'x'), 'outra'))).reason).toBe('unknown_session');
    expect((await run(envelope('presence', {}))).reason).toBe('event_not_handled');
  });
});

describe('CRM: lead automático para número novo', () => {
  it('cria a oportunidade na primeira etapa aberta do funil padrão', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('M1', 'Olá!')));
    expect(db.t.opportunities).toHaveLength(1);
    expect(db.t.opportunities[0]).toMatchObject({ organization_id: 'org1', pipeline_id: 'p1', stage_id: 's-novo', contact_id: db.t.contacts[0].id, title: 'João' });
  });
  it('não cria de novo para o mesmo contato nem para contato que já existia', async () => {
    const { db, run } = setup();
    await run(envelope('messages.received', text('M1', 'Olá!')));
    await run(envelope('messages.received', text('M2', 'Mais uma')));
    expect(db.t.opportunities).toHaveLength(1);

    const second = setup();
    second.db.t.contacts.push({ id: 'c-antigo', organization_id: 'org1', full_name: 'Já cadastrado', phone_e164: '+5511999990000' });
    await second.run(envelope('messages.received', text('M1', 'Oi')));
    expect(second.db.t.opportunities).toHaveLength(0);
  });
  it('não cria quando a empresa escreveu primeiro (mensagem do celular) nem quando a opção está desligada', async () => {
    const outbound = setup();
    await outbound.run(envelope('messages.received', text('M1', 'Oi', { fromMe: true, from: { jid: '558005915338@s.whatsapp.net' }, to: { jid: '5511999990000@s.whatsapp.net', name: 'João' } })));
    expect(outbound.db.t.opportunities).toHaveLength(0);

    const off = setup({ settings: { provider: 'd-api', auto_create_leads: false } });
    await off.run(envelope('messages.received', text('M1', 'Oi')));
    expect(off.db.t.opportunities).toHaveLength(0);
    expect(off.db.t.messages).toHaveLength(1);
  });
  it('sem funil configurado, ou se o CRM falhar, a mensagem é salva do mesmo jeito', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const noCrm = setup({ crm: false });
    await noCrm.run(envelope('messages.received', text('M1', 'Oi')));
    expect(noCrm.db.t.messages).toHaveLength(1);
    expect(noCrm.db.t.opportunities).toHaveLength(0);

    const broken = setup();
    broken.db.failTables.add('opportunities');
    expect((await broken.run(envelope('messages.received', text('M1', 'Oi')))).handled).toBe(true);
    expect(broken.db.t.messages).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('message.delivered / message.read', () => {
  const sent = (db: FakeDb, status = 'sent', extra: Row = {}) =>
    db.t.messages.push({ id: 'mx', organization_id: 'org1', provider: 'd-api', provider_message_id: '3EB0ABC', direction: 'outbound', delivery_status: status, ...extra });

  it('avança sent -> delivered -> read e nunca volta atrás', async () => {
    const { db, run } = setup(); sent(db);
    expect((await run(envelope('message.delivered', { message_id: '3EB0ABC' }))).handled).toBe(true);
    expect(db.t.messages[0].delivery_status).toBe('delivered');
    expect((await run(envelope('message.read', { message_id: '3EB0ABC' }))).handled).toBe(true);
    expect(db.t.messages[0].delivery_status).toBe('read');
    expect((await run(envelope('message.delivered', { message_id: '3EB0ABC' }))).reason).toBe('status_not_advanced');
    expect(db.t.messages[0].delivery_status).toBe('read');
  });
  it('lida pode chegar sem o aviso de entregue antes', async () => {
    const { db, run } = setup(); sent(db);
    await run(envelope('message.read', { message_id: '3EB0ABC' }));
    expect(db.t.messages[0].delivery_status).toBe('read');
  });
  it('não mexe em mensagem falha, recebida, inexistente, de outro workspace ou sem id', async () => {
    const failed = setup(); sent(failed.db, 'failed');
    expect((await failed.run(envelope('message.read', { message_id: '3EB0ABC' }))).reason).toBe('status_not_advanced');
    expect(failed.db.t.messages[0].delivery_status).toBe('failed');

    const inbound = setup(); sent(inbound.db, 'received', { direction: 'inbound' });
    expect((await inbound.run(envelope('message.read', { message_id: '3EB0ABC' }))).reason).toBe('message_not_found');

    const other = setup(); sent(other.db, 'sent', { organization_id: 'org2' });
    expect((await other.run(envelope('message.read', { message_id: '3EB0ABC' }))).reason).toBe('message_not_found');

    const none = setup();
    expect((await none.run(envelope('message.read', { message_id: 'NAO_EXISTE' }))).reason).toBe('message_not_found');
    expect((await none.run(envelope('message.read', {}))).reason).toBe('status_without_message_id');
  });
});

describe('connection.status', () => {
  it('atualiza conectado/desconectado e ignora estados intermediários', async () => {
    const { db, run } = setup();
    await run(envelope('connection.status', { status: 'connected', phone: '5511988887777' }));
    expect(db.t.channel_connections[0]).toMatchObject({ status: 'connected', display_name: 'WhatsApp · +5511988887777' });
    await run(envelope('connection.status', { status: 'logged_out', reason: 'device_removed' }));
    expect(db.t.channel_connections[0]).toMatchObject({ status: 'disconnected' });
    expect(db.t.channel_connections[0].settings.disconnect_reason).toBe('device_removed');
    expect((await run(envelope('connection.status', { status: 'connecting' }))).reason).toBe('status_not_handled');
  });
});

describe('helpers', () => {
  it('jidToPhone, mapMessageType e parseTimestamp', () => {
    expect(jidToPhone('5511999990000:12@s.whatsapp.net')).toBe('+5511999990000');
    expect(jidToPhone('1@lid')).toBeNull();
    expect(mapMessageType('ptt')).toBe('audio');
    expect(mapMessageType('poll')).toBe('text');
    expect(Date.parse(parseTimestamp(1769295092))).toBe(1769295092000);
  });
});
