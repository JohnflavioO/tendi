import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MetaApiError, exchangeInstagramCode, exchangeInstagramLongLivedToken, getInstagramAccount, listMetaPages, sendInstagramText,
  sendMessengerText,
} from './meta-client';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

describe('Messenger (graph.facebook.com)', () => {
  it('lista as páginas com o token de cada uma', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ data: [{ id: 'p1', name: 'Minha Página', access_token: 'tok-1' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const pages = await listMetaPages('user-token');
    expect(pages).toEqual([{ id: 'p1', name: 'Minha Página', access_token: 'tok-1' }]);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('graph.facebook.com/v21.0/me/accounts');
  });

  it('envia uma mensagem de texto pelo token da página', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ message_id: 'm1' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendMessengerText('page-token', 'psid-1', 'Olá!');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://graph.facebook.com/v21.0/me/messages');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('access_token=page-token');
    expect(decodeURIComponent(init.body)).toContain('"id":"psid-1"');
  });

  it('propaga o erro da Graph API', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: { message: 'Token inválido', code: 190 } }, false, 401)));
    const failure = await listMetaPages('ruim').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MetaApiError);
    expect((failure as Error).message).toBe('Token inválido');
  });
});

describe('Instagram (graph.instagram.com / api.instagram.com)', () => {
  it('troca o código pelo token de curta duração', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ access_token: 'short-token', user_id: '123' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await exchangeInstagramCode({ client_id: '1', client_secret: 's', grant_type: 'authorization_code', redirect_uri: 'https://x/cb', code: 'c' });
    expect(result).toEqual({ accessToken: 'short-token', userId: '123' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.instagram.com/oauth/access_token');
  });

  it('troca o token curto pelo de longa duração', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse({ access_token: 'long-token', expires_in: 5184000 })));
    const token = await exchangeInstagramLongLivedToken({ grant_type: 'ig_exchange_token', client_secret: 's', access_token: 'short-token' });
    expect(token).toBe('long-token');
  });

  it('busca a conta do Instagram dona do token', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ user_id: '456', username: 'minhaloja' }));
    vi.stubGlobal('fetch', fetchMock);
    const account = await getInstagramAccount('ig-token');
    expect(account).toEqual({ id: '456', username: 'minhaloja' });
    expect(String(fetchMock.mock.calls[0]![0])).toContain('graph.instagram.com/v21.0/me');
  });

  it('envia uma mensagem de texto pela conta do Instagram', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ message_id: 'm2' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendInstagramText('ig-token', 'igsid-1', 'Oi!');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://graph.instagram.com/v21.0/me/messages');
    expect(init.body).toContain('access_token=ig-token');
  });

  it('falha com uma mensagem clara quando o token não vem na resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse({})));
    await expect(exchangeInstagramCode({})).rejects.toThrow('token de acesso');
  });
});
