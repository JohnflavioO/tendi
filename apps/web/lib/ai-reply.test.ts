import { describe, expect, it, vi } from 'vitest';
import { MAX_AI_REPLIES_PER_DAY, extractQuickOptions, runAiAutoReply, splitHandoff, toChatTurns, withQuickOptions } from './ai-reply';
import { normalizeTurns, supportsEffort } from './ai-llm';
import { HANDOFF_MARKER } from './ai-agent';

// Banco em memória com só o que a resposta automática usa do Supabase.
type Row = Record<string, any>;
class FakeDb {
  t: Record<string, Row[]> = {
    conversations: [], messages: [], ai_agents: [], organizations: [], subscription_plans: [], platform_settings: [],
    ai_business_profiles: [], ai_knowledge_items: [], channel_connections: [], ai_usage_events: [],
  };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode = 'select'; preds: Array<(r: Row) => boolean> = []; payload: any; orders: Array<[string, boolean]> = []; max = Infinity;
  head = false; wantRows = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_c?: string, opts?: { head?: boolean }) { if (this.mode !== 'select') this.wantRows = true; this.head = Boolean(opts?.head); return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(c: string, v: any) { this.preds.push(r => r[c] === v); return this; }
  neq(c: string, v: any) { this.preds.push(r => r[c] !== v); return this; }
  in(c: string, v: any[]) { this.preds.push(r => v.includes(r[c])); return this; }
  gte(c: string, v: any) { this.preds.push(r => r[c] >= v); return this; }
  contains(c: string, v: any) {
    const subset = (a: any, b: any): boolean => b && typeof b === 'object' ? Boolean(a) && Object.keys(b).every(k => subset(a[k], b[k])) : a === b;
    this.preds.push(r => subset(r[c], v)); return this;
  }
  or(expr: string) { const id = expr.split('.neq.')[1]; this.preds.push(r => r.ai_replied_to_message_id == null || r.ai_replied_to_message_id !== id); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  private run(): any {
    const rows = this.db.t[this.table]!;
    const matched = rows.filter(r => this.preds.every(p => p(r)));
    if (this.mode === 'insert') { const row = { id: `${this.table}-${++this.db.n}`, created_at: new Date().toISOString(), ...this.payload }; rows.push(row); return { data: [row], error: null }; }
    if (this.mode === 'update') { matched.forEach(r => Object.assign(r, this.payload)); return { data: this.wantRows ? matched : null, error: null }; }
    let out = matched;
    for (const [col, asc] of [...this.orders].reverse()) out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
    return { data: this.head ? null : out.slice(0, this.max), count: matched.length, error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

function setup(options: { aiMode?: string; agentEnabled?: boolean; reply?: string; refused?: boolean } = {}) {
  const db = new FakeDb();
  db.t.organizations.push({ id: 'org1', name: 'Clínica Sorriso', status: 'active', plan_code: 'tendi_start', trial_ends_at: null });
  db.t.subscription_plans.push({ code: 'tendi_start', ai_enabled: true });
  db.t.ai_agents.push({ organization_id: 'org1', name: 'Bia', is_enabled: options.agentEnabled ?? true, niche: 'odontologia', tone: 'cordial', system_instructions: '', provider: null, model: null });
  db.t.platform_settings.push({ key: 'ai', value: { provider: 'anthropic', models: { anthropic: 'claude-haiku-5-5', openai: '' } } });
  db.t.ai_business_profiles.push({ organization_id: 'org1', handoff_message: 'Já chamo alguém da equipe!', timezone: 'America/Fortaleza', business_hours: {} });
  db.t.channel_connections.push({ organization_id: 'org1', channel: 'whatsapp', provider_account_id: 'sess-1', status: 'connected' });
  db.t.conversations.push({ id: 'c1', organization_id: 'org1', channel: 'whatsapp', ai_mode: options.aiMode ?? 'on', ai_replied_to_message_id: null, contacts: { phone_e164: '+5585999990000' } });
  db.t.messages.push(
    { id: 'm0', conversation_id: 'c1', direction: 'inbound', message_type: 'text', body: 'Oi', created_at: '2026-11-11T10:00:00.000Z' },
    { id: 'm1', conversation_id: 'c1', direction: 'inbound', message_type: 'text', body: 'Quanto custa a limpeza?', created_at: '2026-11-11T10:00:05.000Z' },
  );
  const generate = vi.fn(async (_input: unknown) => ({ text: options.reply ?? 'A limpeza custa R$ 150.', inputTokens: 900, outputTokens: 40, refused: options.refused ?? false }));
  const send = vi.fn(async () => ({ messageId: 'WA-1' }));
  const deps = { generate, send, resolveKey: async () => 'sk-ant-test', sleep: async () => undefined, now: () => new Date('2026-11-11T13:00:00Z') };
  const trigger = { organizationId: 'org1', conversationId: 'c1', messageId: 'm1' };
  return { db, deps, trigger, generate, send, run: () => runAiAutoReply(db as any, trigger, deps) };
}

describe('runAiAutoReply', () => {
  it('responde pelo WhatsApp, identifica a mensagem como da IA e registra o uso', async () => {
    const { db, run, send, generate } = setup();
    expect(await run()).toEqual({ status: 'replied' });
    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0]![0] as any;
    expect(call).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-ant-test' });
    expect(call.system).toContain('Clínica Sorriso');
    expect(call.messages).toEqual([{ role: 'user', content: 'Oi' }, { role: 'user', content: 'Quanto custa a limpeza?' }]);
    expect(send).toHaveBeenCalledWith('/messages/send/text', { sessionId: 'sess-1', to: '5585999990000', text: '*Bia:*\nA limpeza custa R$ 150.' });
    const sent = db.t.messages.find(m => m.direction === 'outbound')!;
    expect(sent).toMatchObject({ delivery_status: 'sent', provider_message_id: 'WA-1', body: 'A limpeza custa R$ 150.' });
    expect(sent.payload.sender).toEqual({ type: 'ai', name: 'Bia' });
    expect(db.t.ai_usage_events[0]).toMatchObject({ outcome: 'replied', input_tokens: 900, output_tokens: 40 });
    expect(db.t.conversations[0].ai_mode).toBe('on');
  });

  it('opções rápidas viram botões nativos no WhatsApp (não lista numerada)', async () => {
    const { db, run, send } = setup({ reply: 'Qual horário prefere? [[OPCOES: Manhã | Tarde]]' });
    expect(await run()).toEqual({ status: 'replied' });
    expect(send).toHaveBeenCalledWith('/interactive/send/nativeflow', {
      sessionId: 'sess-1',
      to: '5585999990000',
      body: '*Bia:*\nQual horário prefere?',
      buttons: [
        { type: 'quick_reply', title: 'Manhã', id: 'opt-1' },
        { type: 'quick_reply', title: 'Tarde', id: 'opt-2' },
      ],
    });
    const sent = db.t.messages.find(m => m.direction === 'outbound')!;
    expect(sent).toMatchObject({ message_type: 'interactive', body: 'Qual horário prefere?\n\n1. Manhã\n2. Tarde' });
    expect(sent.payload.interactive).toEqual({ type: 'nativeflow', buttons: [
      { type: 'quick_reply', title: 'Manhã', id: 'opt-1' },
      { type: 'quick_reply', title: 'Tarde', id: 'opt-2' },
    ] });
  });

  it('nunca responde duas vezes à mesma mensagem (webhook reentregue)', async () => {
    const { run, send } = setup();
    await run();
    expect(await run()).toEqual({ status: 'skipped', reason: 'newer_message' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a trava impede respostas paralelas para a mesma mensagem', async () => {
    const { db, run, send } = setup();
    db.t.conversations[0].ai_replied_to_message_id = 'm1';
    expect(await run()).toEqual({ status: 'skipped', reason: 'already_claimed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('se chegou outra mensagem do cliente, deixa a mais nova responder', async () => {
    const { run, send, trigger, db, deps } = setup();
    expect(await runAiAutoReply(db as any, { ...trigger, messageId: 'm0' }, deps)).toEqual({ status: 'skipped', reason: 'newer_message' });
    expect(send).not.toHaveBeenCalled();
    expect((await run()).status).toBe('replied');
  });

  it('fica quieta com a IA desligada, em handoff ou com o agente bloqueado', async () => {
    expect((await setup({ aiMode: 'off' }).run()).reason).toBe('ai_off');
    expect((await setup({ aiMode: 'handoff' }).run()).reason).toBe('ai_off');
    expect((await setup({ agentEnabled: false }).run()).reason).toBe('agent_disabled');
  });

  it('não responde se o plano não inclui IA ou o teste venceu', async () => {
    const plan = setup(); plan.db.t.subscription_plans[0]!.ai_enabled = false;
    expect((await plan.run()).reason).toBe('plan_without_ai');
    const trial = setup(); Object.assign(trial.db.t.organizations[0]!, { status: 'trial', trial_ends_at: '2026-11-01T00:00:00Z' });
    expect((await trial.run()).reason).toBe('organization_inactive');
  });

  it('marcador de transferência: envia o texto sem o marcador e passa a conversa para um atendente', async () => {
    const { db, run, send } = setup({ reply: `Vou chamar alguém da equipe.\n${HANDOFF_MARKER}` });
    expect(await run()).toEqual({ status: 'handoff' });
    expect((send.mock.calls[0] as any)[1].text).toBe('*Bia:*\nVou chamar alguém da equipe.');
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
    expect(db.t.ai_usage_events[0].outcome).toBe('handoff');
  });

  it('recusa do modelo vira transferência com a mensagem padrão da empresa', async () => {
    const { db, run, send } = setup({ refused: true, reply: '' });
    expect(await run()).toEqual({ status: 'handoff' });
    expect((send.mock.calls[0] as any)[1].text).toBe('*Bia:*\nJá chamo alguém da equipe!');
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('sem chave de API registra o erro e não envia nada', async () => {
    const { db, deps, trigger, send } = setup();
    const result = await runAiAutoReply(db as any, trigger, { ...deps, resolveKey: async () => null });
    expect(result.status).toBe('error');
    expect(send).not.toHaveBeenCalled();
    expect(db.t.ai_usage_events[0]).toMatchObject({ outcome: 'error' });
  });

  it('falha no envio marca a mensagem como falha', async () => {
    const { db, deps, trigger } = setup();
    const result = await runAiAutoReply(db as any, trigger, { ...deps, send: async () => { throw new Error('session not found'); } });
    expect(result.status).toBe('error');
    expect(db.t.messages.find(m => m.direction === 'outbound')!.delivery_status).toBe('failed');
  });

  it('passou do limite diário da conversa: chama um atendente sem gastar com o modelo', async () => {
    const { db, run, generate } = setup();
    for (let i = 0; i < MAX_AI_REPLIES_PER_DAY; i++) db.t.ai_usage_events.push({ conversation_id: 'c1', outcome: 'replied', created_at: '2026-11-11T12:00:00.000Z' });
    expect(await run()).toEqual({ status: 'handoff', reason: 'daily_limit' });
    expect(generate).not.toHaveBeenCalled();
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });
});

describe('funções auxiliares', () => {
  it('splitHandoff remove o marcador', () => {
    expect(splitHandoff(`Certo!\n${HANDOFF_MARKER}`)).toEqual({ text: 'Certo!', handoff: true });
    expect(splitHandoff('Tudo bem')).toEqual({ text: 'Tudo bem', handoff: false });
  });

  it('toChatTurns descreve mídias e ignora notas internas', () => {
    expect(toChatTurns([
      { direction: 'inbound', message_type: 'audio', body: null },
      { direction: 'internal', message_type: 'text', body: 'nota' },
      { direction: 'outbound', message_type: 'text', body: 'Pode escrever?' },
      { direction: 'inbound', message_type: 'image', body: 'olha isso' },
    ])).toEqual([
      { role: 'user', content: expect.stringContaining('áudio') },
      { role: 'assistant', content: 'Pode escrever?' },
      { role: 'user', content: expect.stringContaining('olha isso') },
    ]);
  });

  it('normalizeTurns junta mensagens seguidas e começa pelo cliente', () => {
    expect(normalizeTurns([
      { role: 'assistant', content: 'Olá!' },
      { role: 'user', content: 'Oi' },
      { role: 'user', content: 'tudo bem?' },
    ])).toEqual([{ role: 'user', content: 'Oi\ntudo bem?' }]);
  });

  it('supportsEffort só para modelos que aceitam o parâmetro', () => {
    expect(supportsEffort('claude-haiku-5-5')).toBe(true);
    expect(supportsEffort('claude-opus-5-5')).toBe(true);
    expect(supportsEffort('claude-haiku-4-5')).toBe(false);
  });
});

describe('limite mensal da empresa', () => {
  const fill = (db: any, n: number, organizationId = 'org1') => {
    for (let i = 0; i < n; i++) db.t.ai_usage_events.push({ organization_id: organizationId, conversation_id: `outra-${i}`, outcome: 'replied', created_at: '2026-11-05T12:00:00.000Z' });
  };

  it('ao atingir o limite do plano, não chama o modelo e passa a conversa para um atendente', async () => {
    const { db, run, generate } = setup();
    db.t.subscription_plans[0]!.ai_monthly_replies = 3;
    fill(db, 3);
    expect(await run()).toEqual({ status: 'handoff', reason: 'monthly_limit' });
    expect(generate).not.toHaveBeenCalled();
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
    expect(db.t.ai_usage_events.at(-1)).toMatchObject({ outcome: 'limit', organization_id: 'org1' });
  });

  it('uso do mês anterior e de outras empresas não conta', async () => {
    const { db, run } = setup();
    db.t.subscription_plans[0]!.ai_monthly_replies = 3;
    fill(db, 5, 'org2');
    for (let i = 0; i < 5; i++) db.t.ai_usage_events.push({ organization_id: 'org1', outcome: 'replied', created_at: '2026-10-20T12:00:00.000Z' });
    expect((await run()).status).toBe('replied');
  });

  it('exceção da empresa vale mais que o plano', async () => {
    const { db, run } = setup();
    db.t.subscription_plans[0]!.ai_monthly_replies = 3;
    db.t.ai_agents[0]!.monthly_reply_limit = 10;
    fill(db, 5);
    expect((await run()).status).toBe('replied');
  });

  it('registra o custo estimado da resposta', async () => {
    const { db, run } = setup();
    await run();
    // claude-haiku-5-5: 900 tokens de entrada a US$ 0,10/M + 40 de saída a US$ 0,50/M
    expect(db.t.ai_usage_events.at(-1)).toMatchObject({ outcome: 'replied', cost_usd: 0.00011 });
  });
});


describe('assinatura da IA', () => {
  it('pode mostrar "assistente virtual" ou ser desligada', async () => {
    const withSuffix = setup();
    withSuffix.db.t.channel_connections[0]!.settings = { signature: { aiSuffix: true } };
    await withSuffix.run();
    expect((withSuffix.send.mock.calls[0] as any)[1].text).toBe('*Bia · assistente virtual:*\nA limpeza custa R$ 150.');
    const off = setup();
    off.db.t.channel_connections[0]!.settings = { signature: { enabled: false } };
    await off.run();
    expect((off.send.mock.calls[0] as any)[1].text).toBe('A limpeza custa R$ 150.');
  });
});

describe('resposta automática no Webchat', () => {
  it('responde sem telefone nem conexão de WhatsApp, e não chama o provedor externo', async () => {
    const { db, run, send } = setup();
    db.t.conversations[0]!.channel = 'webchat';
    db.t.conversations[0]!.contacts = { phone_e164: null };
    db.t.channel_connections.length = 0; // nenhuma conexão de WhatsApp cadastrada
    expect(await run()).toEqual({ status: 'replied' });
    expect(send).not.toHaveBeenCalled();
    const sent = db.t.messages.find(m => m.direction === 'outbound')!;
    expect(sent).toMatchObject({ delivery_status: 'sent', provider: 'webchat', body: 'A limpeza custa R$ 150.' });
  });

  it('nunca responde no Messenger, mesmo com a IA ligada na conversa', async () => {
    const { db, deps, trigger, send, generate } = setup();
    db.t.conversations[0]!.channel = 'messenger';
    const sendInstagram = vi.fn(async () => ({}));
    expect(await runAiAutoReply(db as any, trigger, { ...deps, sendInstagram })).toEqual({ status: 'skipped', reason: 'conversation_not_found' });
    expect(generate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(sendInstagram).not.toHaveBeenCalled();
    expect(db.t.messages.filter(m => m.direction === 'outbound')).toHaveLength(0);
  });
});

describe('resposta automática no Instagram', () => {
  function instagramSetup(options: Parameters<typeof setup>[0] = {}) {
    const ctx = setup(options);
    const { db } = ctx;
    db.t.conversations[0]!.channel = 'instagram';
    db.t.conversations[0]!.contacts = { phone_e164: null, full_name: 'Contato do Instagram', external_id: 'instagram:ig-user-7' };
    // A conexão do WhatsApp continua lá só pela assinatura (configuração da empresa).
    db.t.channel_connections.push({ id: 'conn-ig', organization_id: 'org1', channel: 'instagram', provider_account_id: 'ig-acc-1', status: 'connected' });
    for (const m of db.t.messages) m.sent_at = m.created_at;
    const sendInstagram = vi.fn(async (_input: { connectionId: string; accountId: string; recipientId: string; text: string }) => ({ recipient_id: 'ig-user-7', message_id: 'IG-MID-1' }));
    const deps = { ...ctx.deps, sendInstagram };
    return { ...ctx, sendInstagram, run: () => runAiAutoReply(db as any, ctx.trigger, deps) };
  }

  it('entrega pela Graph API com a assinatura sem asteriscos e registra o id da Meta', async () => {
    const { db, run, send, sendInstagram } = instagramSetup();
    expect(await run()).toEqual({ status: 'replied' });
    expect(send).not.toHaveBeenCalled();
    expect(sendInstagram).toHaveBeenCalledWith({ connectionId: 'conn-ig', accountId: 'ig-acc-1', recipientId: 'ig-user-7', text: 'Bia:\nA limpeza custa R$ 150.' });
    const sent = db.t.messages.find(m => m.direction === 'outbound')!;
    expect(sent).toMatchObject({ provider: 'instagram', delivery_status: 'sent', provider_message_id: 'IG-MID-1', body: 'A limpeza custa R$ 150.' });
    expect(sent.payload.sender).toEqual({ type: 'ai', name: 'Bia' });
    expect(db.t.ai_usage_events[0]).toMatchObject({ outcome: 'replied' });
    expect(db.t.conversations[0].ai_mode).toBe('on');
  });

  it('não chama o cliente de "Contato" (nome provisório do Instagram)', async () => {
    const { run, generate } = instagramSetup();
    await run();
    expect((generate.mock.calls[0]![0] as any).system).not.toMatch(/\bContato\b/);
  });

  it('opções rápidas viram lista numerada também no Instagram', async () => {
    const { run, sendInstagram } = instagramSetup({ reply: 'Qual horário prefere? [[OPCOES: Manhã | Tarde]]' });
    expect(await run()).toEqual({ status: 'replied' });
    expect(sendInstagram.mock.calls[0]![0].text).toBe('Bia:\nQual horário prefere?\n\n1. Manhã\n2. Tarde');
  });

  it('marcador de transferência: envia o aviso e passa a conversa para a equipe', async () => {
    const { db, run, sendInstagram } = instagramSetup({ reply: `Vou chamar alguém da equipe. ${HANDOFF_MARKER}` });
    expect(await run()).toEqual({ status: 'handoff' });
    expect(sendInstagram.mock.calls[0]![0].text).toBe('Bia:\nVou chamar alguém da equipe.');
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('fora da janela de 24 h da Meta: não chama o modelo, não envia e deixa com a equipe', async () => {
    const { db, run, sendInstagram, generate } = instagramSetup();
    for (const m of db.t.messages) m.sent_at = '2026-11-09T12:00:00.000Z'; // agora é 11/11 13:00
    expect(await run()).toEqual({ status: 'handoff', reason: 'outside_24h_window' });
    expect(generate).not.toHaveBeenCalled();
    expect(sendInstagram).not.toHaveBeenCalled();
    expect(db.t.messages.filter(m => m.direction === 'outbound')).toHaveLength(0);
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('a Meta recusou por janela vencida: marca a falha e passa para a equipe', async () => {
    const { db, run, sendInstagram } = instagramSetup();
    sendInstagram.mockRejectedValueOnce(new Error('(#10) This message is sent outside of allowed window.'));
    expect((await run()).status).toBe('error');
    expect(db.t.messages.find(m => m.direction === 'outbound')).toMatchObject({ delivery_status: 'failed' });
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('Instagram desconectado: registra o erro e não envia', async () => {
    const { db, run, sendInstagram } = instagramSetup();
    db.t.channel_connections.find(c => c.channel === 'instagram')!.status = 'disconnected';
    expect(await run()).toEqual({ status: 'error', reason: 'Instagram da empresa desconectado.' });
    expect(sendInstagram).not.toHaveBeenCalled();
  });
});

describe('opções rápidas da IA', () => {
  it('tira o marcador e numera as opções', () => {
    const raw = 'Qual é a maior dificuldade hoje?\n[[OPCOES: Demora para responder | Fora do horário | Controle de vendas]]';
    const quick = extractQuickOptions(raw);
    expect(quick).toEqual({ text: 'Qual é a maior dificuldade hoje?', options: ['Demora para responder', 'Fora do horário', 'Controle de vendas'] });
    expect(withQuickOptions(quick.text, quick.options)).toBe('Qual é a maior dificuldade hoje?\n\n1. Demora para responder\n2. Fora do horário\n3. Controle de vendas');
  });

  it('limita a 3 opções curtas, sem repetidas e sem formatação', () => {
    const quick = extractQuickOptions('Escolha:\n[[opcoes: *Sim* | sim | Não | Talvez | Mais tarde]]');
    expect(quick.options).toEqual(['Sim', 'Não', 'Talvez']);
    expect(extractQuickOptions('Ok [[OPCOES: Uma opção muito longa que passa do limite permitido | Outra]]').options[0]!.length).toBeLessThanOrEqual(24);
  });

  it('marcador com uma opção só some e não vira lista', () => {
    expect(extractQuickOptions('Certo! [[OPCOES: Sim]]')).toEqual({ text: 'Certo!', options: [] });
    expect(extractQuickOptions('Sem opções aqui.')).toEqual({ text: 'Sem opções aqui.', options: [] });
    expect(withQuickOptions('Oi', [])).toBe('Oi');
  });
});

describe('2ª via de boleto pela IA', () => {
  const found = [{ id: 'pay_1', amount: 189, dueDate: '2026-11-20', overdue: false, description: null, digitableLine: '23793.38128', pdfUrl: 'https://x/pdf', invoiceUrl: null }];
  function withBoleto(options: { reply?: string; available?: boolean; find?: () => Promise<any[]> } = {}) {
    const base = setup({ reply: options.reply ?? '[[SEGUNDA_VIA: 529.982.247-25]]' });
    const find = vi.fn(options.find ?? (async () => found));
    const boleto = { available: vi.fn(async () => options.available ?? true), find };
    return { ...base, find, run: () => runAiAutoReply(base.db as any, base.trigger, { ...base.deps, boleto }) };
  }

  it('com a integração ligada, o prompt ensina a Duda a pedir o CPF', async () => {
    const { run, generate } = withBoleto({ reply: 'Me passa o CPF do titular?' });
    await run();
    expect((generate.mock.calls[0]![0] as any).system).toContain('[[SEGUNDA_VIA:');
  });

  it('sem a integração, o prompt não fala de boleto', async () => {
    const { run, generate } = withBoleto({ reply: 'Oi!', available: false });
    await run();
    expect((generate.mock.calls[0]![0] as any).system).not.toContain('SEGUNDA_VIA');
  });

  it('busca pelo CPF e envia a linha digitável e o PDF, sem guardar o CPF inteiro', async () => {
    const { db, run, send, find } = withBoleto();
    expect(await run()).toEqual({ status: 'replied' });
    expect(find).toHaveBeenCalledWith('org1', '52998224725');
    const text = (send.mock.calls[0] as any)[1].text as string;
    expect(text).toContain('Linha digitável: 23793.38128');
    expect(text).toContain('PDF do boleto: https://x/pdf');
    expect(text).not.toContain('SEGUNDA_VIA');
    const sent = db.t.messages.find(m => m.direction === 'outbound')!;
    expect(sent.payload.boleto).toEqual({ lookup: true, found: 1, document: 'CPF final 47-25', ids: ['pay_1'] });
    expect(JSON.stringify(sent)).not.toContain('52998224725');
  });

  it('nada em aberto: avisa o cliente e a IA continua na conversa', async () => {
    const { db, run, send } = withBoleto({ find: async () => [] });
    expect(await run()).toEqual({ status: 'replied' });
    expect((send.mock.calls[0] as any)[1].text).toContain('Não encontrei boleto em aberto para o CPF final 47-25');
    expect(db.t.conversations[0].ai_mode).toBe('on');
  });

  it('CPF inválido: pede de novo, sem consultar o provedor', async () => {
    const { run, send, find } = withBoleto({ reply: '[[SEGUNDA_VIA: 111.111.111-11]]' });
    expect(await run()).toEqual({ status: 'replied' });
    expect(find).not.toHaveBeenCalled();
    expect((send.mock.calls[0] as any)[1].text).toContain('não parece válido');
  });

  it('provedor fora do ar: avisa e passa para a equipe', async () => {
    const { db, run, send } = withBoleto({ find: async () => { throw new Error('timeout'); } });
    expect(await run()).toEqual({ status: 'handoff' });
    expect((send.mock.calls[0] as any)[1].text).toContain('Não consegui consultar o boleto agora');
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('muitas consultas na mesma conversa: para de consultar e chama a equipe', async () => {
    const { db, run, find } = withBoleto();
    // Consultas anteriores nas últimas 24 h (antes da mensagem do cliente, que segue sendo a última).
    for (let i = 0; i < 5; i++) db.t.messages.push({ id: `b${i}`, conversation_id: 'c1', direction: 'outbound', message_type: 'text', body: 'boleto', created_at: '2026-11-11T09:00:00.000Z', payload: { boleto: { lookup: true } } });
    expect(await run()).toEqual({ status: 'handoff' });
    expect(find).not.toHaveBeenCalled();
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });

  it('marcador sem integração não chega ao cliente: a equipe assume', async () => {
    const { db, run, send } = withBoleto({ available: false });
    expect(await run()).toEqual({ status: 'handoff' });
    expect((send.mock.calls[0] as any)[1].text).toBe('*Bia:*\nJá chamo alguém da equipe!');
    expect(db.t.conversations[0].ai_mode).toBe('handoff');
  });
});
