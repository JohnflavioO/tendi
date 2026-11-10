import { describe, expect, it, vi } from 'vitest';
import { friendlySendError, pickProviderMessageId, sendWhatsappText } from './inbox-send';

type Row = Record<string, any>;
class Fake {
  t: Record<string, Row[]> = { conversations: [], channel_connections: [], messages: [] };
  n = 0; writes = 0;
  from(table: string) { return new Q(this, table); }
}
class Q {
  mode = 'select'; filters: Array<[string, any]> = []; payload: any;
  constructor(private db: Fake, private table: string) {}
  select(_c?: string) { return this; }
  insert(r: Row) { this.mode = 'insert'; this.payload = r; return this; }
  update(p: Row) { this.mode = 'update'; this.payload = p; return this; }
  eq(c: string, v: any) { this.filters.push([c, v]); return this; }
  private run(): { data: any; error: any } {
    const rows = this.db.t[this.table];
    if (this.mode === 'select') return { data: rows.filter(r => this.filters.every(([c, v]) => r[c] === v)), error: null };
    this.db.writes++;
    if (this.mode === 'update') { rows.filter(r => this.filters.every(([c, v]) => r[c] === v)).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    const row = { id: `m${++this.db.n}`, ...this.payload }; rows.push(row); return { data: [row], error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(res: any, rej: any) { return Promise.resolve(this.run()).then(res, rej); }
}

const ORG = '11111111-1111-1111-1111-111111111111';
const CID = '22222222-2222-2222-2222-222222222222';
function make(over: { conn?: Row | null; conv?: Row } = {}) {
  const db = new Fake();
  db.t.conversations.push({ id: CID, organization_id: ORG, channel: 'whatsapp', contacts: { phone_e164: '+5511999990000' }, status: 'pending', ...over.conv });
  if (over.conn !== null) db.t.channel_connections.push({ organization_id: ORG, channel: 'whatsapp', provider_account_id: 'tendi-x-2', status: 'connected', ...over.conn });
  return db;
}
const okSend = () => vi.fn(async (_path: string, _body: object, _options?: object) => ({ success: true, messageId: '3EB0ABC' }));
const sign = vi.fn(async (path: string) => `https://signed.example/${path}`);
const att = (over: object = {}) => ({ path: `${ORG}/${CID}/u1-foto.jpg`, mimetype: 'image/jpeg', filename: 'foto.jpg', size: 2048, ...over });
const input = (over: object = {}) => ({ userId: 'u1', senderName: 'Maria', conversationId: CID, text: 'Olá', ...over });

describe('texto', () => {
  it('envia, grava como sent com id do provedor e autor', async () => {
    const db = make(); const send = okSend();
    const r = await sendWhatsappText(db as any, input({ text: '  Olá! ' }), send as any);
    expect(r.status).toBe(200);
    expect(send).toHaveBeenCalledWith('/messages/send/text', { sessionId: 'tendi-x-2', to: '5511999990000', text: 'Olá!' }, undefined);
    expect(db.t.messages[0]).toMatchObject({ direction: 'outbound', message_type: 'text', body: 'Olá!', delivery_status: 'sent', provider_message_id: '3EB0ABC', sender_id: 'u1', provider: 'd-api' });
    expect(db.t.messages[0].payload.sender).toMatchObject({ type: 'human', name: 'Maria' });
    expect(db.t.conversations[0].status).toBe('open');
  });
  it('recusa vazio, longo, conversa inválida/inexistente, outro canal, sem telefone e WhatsApp desconectado', async () => {
    const send = okSend();
    expect((await sendWhatsappText(make() as any, input({ text: '   ' }), send as any)).status).toBe(400);
    expect((await sendWhatsappText(make() as any, input({ text: 'a'.repeat(4097) }), send as any)).status).toBe(400);
    expect((await sendWhatsappText(make() as any, input({ conversationId: 'x' }), send as any)).status).toBe(400);
    expect((await sendWhatsappText(make() as any, input({ conversationId: '99999999-2222-3333-4444-555555555555' }), send as any)).status).toBe(404);
    expect((await sendWhatsappText(make({ conv: { channel: 'instagram' } }) as any, input(), send as any)).status).toBe(422);
    expect((await sendWhatsappText(make({ conv: { contacts: { phone_e164: null } } }) as any, input(), send as any)).status).toBe(422);
    expect((await sendWhatsappText(make({ conn: { status: 'disconnected' } }) as any, input(), send as any)).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
  it('falha da D-API marca failed e devolve mensagem amigável', async () => {
    const db = make();
    const r = await sendWhatsappText(db as any, input(), (async () => { throw new Error('Session not found'); }) as any);
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toMatch(/Reconecte/);
    expect(db.t.messages[0].delivery_status).toBe('failed');
  });
  it('leitura com o cliente do usuário, gravação com o cliente de serviço', async () => {
    const user = make(); const service = new Fake(); service.t.conversations.push({ id: CID });
    await sendWhatsappText(user as any, input(), okSend() as any, service as any);
    expect(user.writes).toBe(0);
    expect(service.t.messages[0].delivery_status).toBe('sent');
  });
});

describe('anexos', () => {
  it('imagem com legenda: assina o link, envia pela rota de imagem e grava a mídia', async () => {
    const db = make(); const send = okSend(); sign.mockClear();
    const r = await sendWhatsappText(db as any, input({ text: 'Segue a foto', attachment: att() }), send as any, db as any, sign);
    expect(r.status).toBe(200);
    expect(sign).toHaveBeenCalledWith(`${ORG}/${CID}/u1-foto.jpg`);
    expect(send).toHaveBeenCalledWith('/messages/send/image', { sessionId: 'tendi-x-2', to: '5511999990000', image: `https://signed.example/${ORG}/${CID}/u1-foto.jpg`, caption: 'Segue a foto' }, { timeoutMs: 55_000 });
    expect(db.t.messages[0]).toMatchObject({ message_type: 'image', body: 'Segue a foto', delivery_status: 'sent' });
    expect(db.t.messages[0].payload.media).toMatchObject({ path: `${ORG}/${CID}/u1-foto.jpg`, mimetype: 'image/jpeg', filename: 'foto.jpg', size: 2048 });
  });
  it('documento e vídeo sem legenda (texto vazio é permitido com anexo)', async () => {
    const db = make(); const send = okSend();
    await sendWhatsappText(db as any, input({ text: '', attachment: att({ path: `${ORG}/${CID}/u1-p.pdf`, mimetype: 'application/pdf', filename: 'proposta.pdf' }) }), send as any, db as any, sign);
    expect(send.mock.calls[0]![0]).toBe('/messages/send/document');
    expect(send.mock.calls[0]![1]).toMatchObject({ fileName: 'proposta.pdf', mimetype: 'application/pdf' });
    expect('caption' in (send.mock.calls[0]![1] as object)).toBe(false);
    expect(db.t.messages[0]).toMatchObject({ message_type: 'document', body: null });
    await sendWhatsappText(db as any, input({ text: '', attachment: att({ path: `${ORG}/${CID}/u1-v.mp4`, mimetype: 'video/mp4', filename: 'v.mp4' }) }), send as any, db as any, sign);
    expect(send.mock.calls[1]![0]).toBe('/messages/send/video');
  });
  it('nota de voz (ogg) vai como ptt; áudio comum não', async () => {
    const db = make(); const send = okSend();
    await sendWhatsappText(db as any, input({ text: '', attachment: att({ path: `${ORG}/${CID}/u1-v.ogg`, mimetype: 'audio/ogg;codecs=opus', filename: 'v.ogg', voice: true }) }), send as any, db as any, sign);
    expect(send.mock.calls[0]![0]).toBe('/messages/send/audio');
    expect(send.mock.calls[0]![1]).toMatchObject({ ptt: true });
    expect(db.t.messages[0]).toMatchObject({ message_type: 'audio' });
    await sendWhatsappText(db as any, input({ text: '', attachment: att({ path: `${ORG}/${CID}/u1-m.mp3`, mimetype: 'audio/mpeg', filename: 'm.mp3' }) }), send as any, db as any, sign);
    expect(send.mock.calls[1]![1]).toMatchObject({ ptt: false });
  });
  it('áudio não aceita legenda', async () => {
    const send = okSend();
    const r = await sendWhatsappText(make() as any, input({ text: 'oi', attachment: att({ path: `${ORG}/${CID}/u1-m.mp3`, mimetype: 'audio/mpeg' }) }), send as any, undefined, sign);
    expect(r.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it('recusa caminho de outra empresa sem gravar nem enviar nada', async () => {
    const db = make(); const send = okSend(); sign.mockClear();
    const r = await sendWhatsappText(db as any, input({ attachment: att({ path: `99999999-9999-9999-9999-999999999999/${CID}/x.jpg` }) }), send as any, db as any, sign);
    expect(r.status).toBe(400);
    expect(sign).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(db.t.messages).toHaveLength(0);
  });
  it('arquivo inexistente no Storage ou sem assinatura configurada: erro e nada gravado', async () => {
    const db = make(); const send = okSend();
    expect((await sendWhatsappText(db as any, input({ attachment: att() }), send as any, db as any, async () => null)).status).toBe(400);
    expect((await sendWhatsappText(db as any, input({ attachment: att() }), send as any, db as any, async () => { throw new Error('x'); })).status).toBe(400);
    expect((await sendWhatsappText(db as any, input({ attachment: att() }), send as any)).status).toBe(500);
    expect(db.t.messages).toHaveLength(0); expect(send).not.toHaveBeenCalled();
  });
  it('legenda acima de 1024 caracteres é recusada', async () => {
    const r = await sendWhatsappText(make() as any, input({ text: 'a'.repeat(1025), attachment: att() }), okSend() as any, undefined, sign);
    expect(r.status).toBe(400);
  });
  it('falha da D-API em mídia marca failed mas mantém o anexo registrado', async () => {
    const db = make();
    const r = await sendWhatsappText(db as any, input({ attachment: att() }), (async () => { throw new Error('boom'); }) as any, db as any, sign);
    expect(r.status).toBe(502);
    expect(db.t.messages[0]).toMatchObject({ delivery_status: 'failed', message_type: 'image' });
    expect(db.t.messages[0].payload.media.path).toContain('u1-foto.jpg');
  });
});

describe('helpers', () => {
  it('pickProviderMessageId e friendlySendError', () => {
    expect(pickProviderMessageId({ success: true, messageId: '3EB0A' })).toBe('3EB0A');
    expect(pickProviderMessageId({ data: { id: 'A' } })).toBe('A');
    expect(pickProviderMessageId({ ok: 1 })).toBeNull();
    expect(friendlySendError('Session not found')).toMatch(/Reconecte/);
    expect(friendlySendError('not connected')).toMatch(/desconectado/);
  });
});
