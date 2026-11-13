import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  instagramDialogUrl, metaAccessTokenParams, metaChannelFromObject,
  metaGraphUrl, metaLongLivedTokenParams, messengerDialogUrl, parseMetaWebhookBody, verifyMetaSignature,
} from './meta';

describe('assinatura do webhook', () => {
  const secret = 'app-secret';
  const body = '{"object":"page","entry":[]}';
  const sign = (text: string, key = secret) => `sha256=${createHmac('sha256', key).update(text, 'utf8').digest('hex')}`;

  it('aceita a assinatura correta', () => {
    expect(verifyMetaSignature(body, sign(body), secret)).toBe(true);
  });
  it('recusa assinatura de outro corpo, outro segredo, cabeçalho ausente ou mal formado', () => {
    expect(verifyMetaSignature(body, sign('outro corpo'), secret)).toBe(false);
    expect(verifyMetaSignature(body, sign(body, 'outro-segredo'), secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=xyz', secret)).toBe(false);
  });
});

describe('canal pelo objeto do webhook', () => {
  it.each([['page', 'messenger'], ['instagram', 'instagram']])('%s -> %s', (object, expected) => {
    expect(metaChannelFromObject(object)).toBe(expected);
  });
  it.each(['user', '', null, undefined])('não reconhece %s', object => {
    expect(metaChannelFromObject(object)).toBeNull();
  });
});

describe('URL da Graph API', () => {
  it('monta o endereço com a versão e os parâmetros', () => {
    expect(metaGraphUrl('/me/accounts', { access_token: 'abc' })).toBe('https://graph.facebook.com/v21.0/me/accounts?access_token=abc');
    expect(metaGraphUrl('me', {})).toBe('https://graph.facebook.com/v21.0/me');
  });
});

describe('diálogo de login do Messenger (Facebook)', () => {
  it('monta a URL de autorização com o estado e os escopos de página', () => {
    const url = new URL(messengerDialogUrl({ appId: '123', redirectUri: 'https://app.tendi.com.br/api/meta/oauth/callback', state: 'abc' }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.tendi.com.br/api/meta/oauth/callback');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('scope')).toBe('pages_show_list,pages_messaging,pages_manage_metadata');
  });
});

describe('diálogo de login do Instagram (Unified login)', () => {
  it('monta a URL de autorização na mesma tela do Facebook, com o config_id no lugar do scope', () => {
    const url = new URL(instagramDialogUrl({ appId: '123', redirectUri: 'https://app.tendi.com.br/api/meta/instagram/oauth/callback', state: 'xyz', configId: '456' }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('123');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('config_id')).toBe('456');
    expect(url.searchParams.get('scope')).toBeNull();
  });
});

describe('parâmetros de troca de token do Facebook', () => {
  it('monta os parâmetros do código pelo token', () => {
    expect(metaAccessTokenParams({ appId: '1', appSecret: 's', redirectUri: 'https://x/cb', code: 'c' }))
      .toEqual({ client_id: '1', client_secret: 's', redirect_uri: 'https://x/cb', code: 'c' });
  });
  it('monta os parâmetros da troca para token de longa duração', () => {
    expect(metaLongLivedTokenParams({ appId: '1', appSecret: 's', shortLivedToken: 't' }))
      .toEqual({ grant_type: 'fb_exchange_token', client_id: '1', client_secret: 's', fb_exchange_token: 't' });
  });
});

describe('leitura do corpo do webhook', () => {
  const mk = (overrides: Record<string, unknown> = {}) => ({
    object: 'page',
    entry: [{ id: 'page-1', messaging: [{ sender: { id: 'user-1' }, recipient: { id: 'page-1' }, timestamp: 1700000000000, message: { mid: 'm1', text: 'Oi, tudo bem?' }, ...overrides }] }],
  });

  it('lê uma mensagem de texto', () => {
    expect(parseMetaWebhookBody(mk())).toEqual([{ pageId: 'page-1', senderId: 'user-1', mid: 'm1', text: 'Oi, tudo bem?', kind: 'text', timestamp: '2023-11-14T22:13:20.000Z' }]);
  });

  it('ignora o eco da própria página', () => {
    expect(parseMetaWebhookBody(mk({ message: { mid: 'm1', text: 'oi', is_echo: true } }))).toEqual([]);
  });

  it('descreve um anexo sem texto', () => {
    const result = parseMetaWebhookBody(mk({ message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://x' } }] } }));
    expect(result).toEqual([{ pageId: 'page-1', senderId: 'user-1', mid: 'm2', text: '[Imagem]', kind: 'image', timestamp: '2023-11-14T22:13:20.000Z' }]);
  });

  it('ignora eventos sem remetente, sem id da mensagem ou sem corpo de mensagem (entrega/leitura)', () => {
    expect(parseMetaWebhookBody(mk({ message: undefined, delivery: { mids: ['m1'] } }))).toEqual([]);
    expect(parseMetaWebhookBody({ object: 'page', entry: [{ id: '', messaging: [{ sender: { id: 'u1' }, message: { mid: 'm1', text: 'oi' } }] }] })).toEqual([]);
  });

  it('ignora corpo que não é um objeto com entry', () => {
    expect(parseMetaWebhookBody(null)).toEqual([]);
    expect(parseMetaWebhookBody({})).toEqual([]);
    expect(parseMetaWebhookBody('string')).toEqual([]);
  });

  it('lê várias mensagens de várias páginas', () => {
    const body = { object: 'page', entry: [mk().entry[0], { id: 'page-2', messaging: [{ sender: { id: 'user-2' }, timestamp: 1700000001000, message: { mid: 'm3', text: 'Olá' } }] }] };
    expect(parseMetaWebhookBody(body)).toHaveLength(2);
  });
});
