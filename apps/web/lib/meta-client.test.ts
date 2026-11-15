import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MetaApiError, getInstagramAccount, listMetaPages, sendInstagramText,
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

  it('no login empresarial, lista as Páginas marcadas pelas permissões do token quando /me/accounts vem vazio', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('/me/accounts')) return jsonResponse({ data: [] });
      if (href.includes('/debug_token')) return jsonResponse({ data: { granular_scopes: [{ scope: 'pages_messaging', target_ids: ['p7'] }, { scope: 'pages_show_list', target_ids: ['p7'] }] } });
      if (href.includes('/p7')) return jsonResponse({ id: 'p7', name: 'TendiDesk', access_token: 'tok-7' });
      return jsonResponse({ error: { message: 'inesperado' } }, false);
    }));
    expect(await listMetaPages('user-token', 'app|secret')).toEqual([{ id: 'p7', name: 'TendiDesk', access_token: 'tok-7' }]);
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

describe('Instagram (Unified login — mesma Graph API do Messenger)', () => {
  it('busca, entre as páginas do usuário, a que tem uma conta do Instagram vinculada', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({
      data: [
        { id: 'p0', name: 'Sem Instagram', access_token: 'tok-0' },
        { id: 'p1', name: 'Minha Página', access_token: 'tok-1', instagram_business_account: { id: '456', username: 'minhaloja' } },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const account = await getInstagramAccount('user-token');
    expect(account).toEqual({ id: '456', username: 'minhaloja', pageId: 'p1', pageAccessToken: 'tok-1' });
    expect(String(fetchMock.mock.calls[0]![0])).toContain('graph.facebook.com/v21.0/me/accounts');
  });

  it('falha com uma mensagem clara quando nenhuma página tem conta do Instagram vinculada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(jsonResponse({ data: [{ id: 'p0', name: 'Sem Instagram', access_token: 'tok-0' }] })));
    await expect(getInstagramAccount('user-token')).rejects.toThrow('Nenhuma conta do Instagram vinculada');
  });

  it('no login empresarial, acha a Página pelas permissões do token quando /me/accounts vem vazio', async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('/me/accounts')) return jsonResponse({ data: [] });
      if (href.includes('/debug_token')) return jsonResponse({ data: { granular_scopes: [
        { scope: 'instagram_manage_messages', target_ids: ['456'] },
        { scope: 'pages_show_list', target_ids: ['p9'] },
      ] } });
      if (href.includes('/p9')) return jsonResponse({ id: 'p9', access_token: 'tok-9', instagram_business_account: { id: '456', username: 'tendidesk' } });
      return jsonResponse({ error: { message: 'inesperado' } }, false);
    });
    vi.stubGlobal('fetch', fetchMock);
    const account = await getInstagramAccount('user-token', 'app|secret');
    expect(account).toEqual({ id: '456', username: 'tendidesk', pageId: 'p9', pageAccessToken: 'tok-9' });
  });

  it('envia uma mensagem de texto pela conta do Instagram, usando o token da Página', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ message_id: 'm2' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendInstagramText('page-token', '456', 'igsid-1', 'Oi!');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://graph.facebook.com/v21.0/456/messages');
    expect(init.body).toContain('access_token=page-token');
    expect(decodeURIComponent(init.body)).toContain('"id":"igsid-1"');
  });
});
