import { describe, expect, it, vi } from 'vitest';
import { hashWebchatToken, listWebchatMessagesSince, loadWebchatSession, newWebchatToken, postWebchatMessage, startWebchatSession } from './webchat-server';

type Row = Record<string, any>;
class FakeDb {
  t: Record<string, Row[]> = { contacts: [], conversations: [], webchat_sessions: [], messages: [], ai_agents: [] };
  n = 0;
  storage = { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }) }) };
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode: 'select' | 'insert' | 'update' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  sort: string | null = null;
  asc = true;
  max = Infinity;
  head = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_columns?: string, opts?: { count?: string; head?: boolean }) { this.head = Boolean(opts?.head); return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(column: string, value: any) { this.preds.push(row => row[column] === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => row[column] !== value); return this; }
  gt(column: string, value: any) { this.preds.push(row => row[column] > value); return this; }
  gte(column: string, value: any) { this.preds.push(row => row[column] >= value); return this; }
  order(column: string, opts?: { ascending?: boolean }) { this.sort = column; this.asc = opts?.ascending !== false; return this; }
  limit(count: number) { this.max = count; return this; }
  private run(): { data: any; error: any; count?: number } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') { const row = { id: `${this.table}-${++this.db.n}`, created_at: new Date().toISOString(), ...this.payload }; rows.push(row); return { data: [row], error: null }; }
    let matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: matched, error: null }; }
    if (this.sort) matched = [...matched].sort((a, b) => (a[this.sort!] < b[this.sort!] ? -1 : 1) * (this.asc ? 1 : -1));
    return { data: this.head ? null : matched.slice(0, this.max), count: matched.length, error: null };
  }
  maybeSingle() { const result = this.run(); return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

function seed() {
  const db = new FakeDb();
  db.t.ai_agents.push({ organization_id: 'org-1', is_enabled: false, auto_enable_new_conversations: false });
  return db;
}

describe('token do visitante', () => {
  it('gera um token e um hash sempre diferentes, e o hash é reproduzível', () => {
    const first = newWebchatToken();
    const second = newWebchatToken();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
    expect(hashWebchatToken(first.token)).toBe(first.hash);
  });
});

describe('startWebchatSession', () => {
  it('cria contato, conversa e sessão', async () => {
    const db = seed();
    const session = await startWebchatSession(db as any, { id: 'widget-1', organization_id: 'org-1', is_enabled: true, display_name: 'Atendimento', greeting_message: 'Oi', color: '#004751' });
    expect(session.token).toHaveLength(48);
    expect(db.t.contacts[0]).toMatchObject({ organization_id: 'org-1', full_name: 'Visitante do site' });
    expect(db.t.conversations[0]).toMatchObject({ organization_id: 'org-1', channel: 'webchat', status: 'open', ai_mode: 'off' });
    expect(db.t.webchat_sessions[0]).toMatchObject({ organization_id: 'org-1', conversation_id: session.conversationId, token_hash: hashWebchatToken(session.token) });
  });
});

describe('loadWebchatSession', () => {
  it('encontra a sessão pelo token e devolve o modo da IA', async () => {
    const db = seed();
    const session = await startWebchatSession(db as any, { id: 'widget-1', organization_id: 'org-1', is_enabled: true, display_name: 'Atendimento', greeting_message: 'Oi', color: '#004751' });
    db.t.conversations[0]!.ai_mode = 'on';
    // O FakeDb não simula o JOIN do Postgrest: anexa à mão o que "conversations(ai_mode)" devolveria.
    db.t.webchat_sessions[0]!.conversations = { ai_mode: 'on' };
    const loaded = await loadWebchatSession(db as any, session.token);
    expect(loaded).toMatchObject({ organizationId: 'org-1', conversationId: session.conversationId, aiMode: 'on' });
  });

  it('recusa token errado, vazio ou vencido', async () => {
    const db = seed();
    const session = await startWebchatSession(db as any, { id: 'widget-1', organization_id: 'org-1', is_enabled: true, display_name: 'Atendimento', greeting_message: 'Oi', color: '#004751' });
    expect(await loadWebchatSession(db as any, '')).toBeNull();
    expect(await loadWebchatSession(db as any, 'token-errado')).toBeNull();
    db.t.webchat_sessions[0]!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await loadWebchatSession(db as any, session.token)).toBeNull();
  });
});

describe('postWebchatMessage', () => {
  const session = { organizationId: 'org-1', contactId: 'contact-1', conversationId: 'conv-1', aiMode: 'off' };

  it('grava a mensagem e atualiza a conversa', async () => {
    const db = seed();
    db.t.conversations.push({ id: 'conv-1' });
    db.t.contacts.push({ id: 'contact-1' });
    const result = await postWebchatMessage(db as any, session, 'Olá, tudo bem?');
    expect(result).toMatchObject({ ok: true, aiMode: 'off' });
    expect(db.t.messages[0]).toMatchObject({ conversation_id: 'conv-1', direction: 'inbound', body: 'Olá, tudo bem?', provider: 'webchat' });
    expect(db.t.conversations[0]!.unread_count).toBe(1);
  });

  it('bloqueia depois de 20 mensagens em 1 minuto', async () => {
    const db = seed();
    db.t.conversations.push({ id: 'conv-1' });
    db.t.contacts.push({ id: 'contact-1' });
    for (let i = 0; i < 20; i += 1) db.t.messages.push({ conversation_id: 'conv-1', direction: 'inbound', created_at: new Date().toISOString() });
    const result = await postWebchatMessage(db as any, session, 'Mais uma');
    expect(result).toEqual({ ok: false, status: 429, error: 'Muitas mensagens em pouco tempo. Aguarde um instante.' });
  });
});

describe('listWebchatMessagesSince', () => {
  it('lista as mensagens e assina o link de um anexo', async () => {
    const db = seed();
    db.t.messages.push(
      { id: 'm1', conversation_id: 'conv-1', direction: 'outbound', body: 'Oi!', created_at: '2026-11-13T12:00:00.000Z', delivery_status: 'sent', payload: { sender: { type: 'ai', name: 'Duda' } } },
      { id: 'm2', conversation_id: 'conv-1', direction: 'outbound', body: null, created_at: '2026-11-13T12:01:00.000Z', delivery_status: 'sent', payload: { media: { path: 'org-1/conv-1/foto.jpg', filename: 'foto.jpg' } } },
      { id: 'm3', conversation_id: 'conv-2', direction: 'outbound', body: 'outra conversa', created_at: '2026-11-13T12:02:00.000Z', delivery_status: 'sent', payload: null },
    );
    const messages = await listWebchatMessagesSince(db as any, 'conv-1', null);
    expect(messages).toEqual([
      { id: 'm1', direction: 'outbound', body: 'Oi!', createdAt: '2026-11-13T12:00:00.000Z', status: 'sent', mediaUrl: null, filename: null, senderName: 'Duda' },
      { id: 'm2', direction: 'outbound', body: null, createdAt: '2026-11-13T12:01:00.000Z', status: 'sent', mediaUrl: 'https://signed.example/org-1/conv-1/foto.jpg', filename: 'foto.jpg', senderName: null },
    ]);
  });

  it('filtra por "after"', async () => {
    const db = seed();
    db.t.messages.push(
      { id: 'm1', conversation_id: 'conv-1', direction: 'inbound', body: 'Oi', created_at: '2026-11-13T12:00:00.000Z', delivery_status: 'received', payload: null },
      { id: 'm2', conversation_id: 'conv-1', direction: 'inbound', body: 'De novo', created_at: '2026-11-13T12:05:00.000Z', delivery_status: 'received', payload: null },
    );
    const messages = await listWebchatMessagesSince(db as any, 'conv-1', '2026-11-13T12:02:00.000Z');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.id).toBe('m2');
  });
});

describe('startWebchatSession com identificação do visitante', () => {
  /** Banco que recusa a 2ª conversa aberta do mesmo contato e canal (como o índice único de verdade). */
  function withUniqueConversations(db: FakeDb) {
    const original = db.from.bind(db);
    db.from = ((table: string) => {
      const query: any = original(table);
      if (table === 'conversations') {
        const insert = query.insert.bind(query);
        query.insert = (row: Row) => {
          const open = db.t.conversations.find(c => c.contact_id === row.contact_id && c.channel === row.channel && c.status !== 'closed');
          if (open) return { select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) };
          return insert(row);
        };
      }
      return query;
    }) as any;
    return db;
  }
  const widget = { id: 'w1', organization_id: 'org-1', is_enabled: true, display_name: 'Atendimento', greeting_message: '', color: '#004751' };

  it('lead novo: contato com nome, WhatsApp e e-mail', async () => {
    const db = seed();
    await startWebchatSession(db as any, widget, { name: 'Isabelly Oliveira', phone: '+5585996370627', email: 'isa@loja.com.br' });
    expect(db.t.contacts).toHaveLength(1);
    expect(db.t.contacts[0]).toMatchObject({ full_name: 'Isabelly Oliveira', phone_e164: '+5585996370627', email: 'isa@loja.com.br' });
    expect(db.t.conversations[0]).toMatchObject({ contact_id: db.t.contacts[0]!.id, channel: 'webchat' });
  });

  it('telefone que já existe: usa o mesmo cadastro e só completa o que falta', async () => {
    const db = seed();
    db.t.contacts.push({ id: 'c-zap', organization_id: 'org-1', full_name: 'Isa (cliente antiga)', phone_e164: '+5585996370627', email: null });
    await startWebchatSession(db as any, widget, { name: 'Isabelly', phone: '+5585996370627', email: 'isa@loja.com.br' });
    expect(db.t.contacts).toHaveLength(1);
    expect(db.t.contacts[0]).toMatchObject({ full_name: 'Isa (cliente antiga)', email: 'isa@loja.com.br' });
    expect(db.t.conversations[0]!.contact_id).toBe('c-zap');
  });

  it('privacidade: telefone de quem já tem conversa aberta no site abre conversa separada', async () => {
    const db = withUniqueConversations(seed());
    db.t.contacts.push({ id: 'c-dono', organization_id: 'org-1', full_name: 'Dono do número', phone_e164: '+5585996370627', email: null });
    db.t.conversations.push({ id: 'conv-dono', organization_id: 'org-1', contact_id: 'c-dono', channel: 'webchat', status: 'open' });
    const session = await startWebchatSession(db as any, widget, { name: 'Outra pessoa', phone: '+5585996370627', email: null });
    expect(session.conversationId).not.toBe('conv-dono');
    const created = db.t.conversations.find(c => c.id === session.conversationId)!;
    expect(created.contact_id).not.toBe('c-dono');
    expect(db.t.contacts.find(c => c.id === created.contact_id)).toMatchObject({ full_name: 'Outra pessoa' });
  });
});
