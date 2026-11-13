import { metaGraphUrl } from './meta';

/**
 * Credenciais do app da Meta (Instagram/Messenger) e chamadas às duas APIs.
 * META_APP_ID/META_APP_SECRET são o app único do Tendi cadastrado no Meta for Developers.
 * O token de cada página/conta fica no Vault (migration dos canais), nunca aqui.
 *
 * Messenger fala com graph.facebook.com, usando o token da PÁGINA do Facebook.
 * Instagram fala com graph.instagram.com (hosts e login diferentes — produtos separados pela
 * Meta), usando o token da própria conta do Instagram, sem passar por nenhuma página.
 */

export const INSTAGRAM_GRAPH_VERSION = 'v21.0';
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`;
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_LONG_LIVED_URL = `https://graph.instagram.com/access_token`;

export class MetaApiError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
  }
}

export function getMetaAppId(): string {
  const value = process.env.META_APP_ID?.trim();
  if (!value) throw new Error('META_APP_ID não está configurada no servidor.');
  return value;
}

export function getMetaAppSecret(): string {
  const value = process.env.META_APP_SECRET?.trim();
  if (!value) throw new Error('META_APP_SECRET não está configurada no servidor.');
  return value;
}

export function getMetaWebhookVerifyToken(): string {
  const value = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!value) throw new Error('META_WEBHOOK_VERIFY_TOKEN não está configurado no servidor.');
  return value;
}

/** O app da Meta já foi cadastrado nas variáveis de ambiente do servidor? */
export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim() && process.env.META_WEBHOOK_VERIFY_TOKEN?.trim());
}

async function parseMetaResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

function metaErrorMessage(payload: unknown): { message: string; code?: number } {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === 'object') {
      const message = typeof (error as Record<string, unknown>).message === 'string' ? (error as Record<string, unknown>).message as string : 'Erro na Graph API da Meta.';
      const code = typeof (error as Record<string, unknown>).code === 'number' ? (error as Record<string, unknown>).code as number : undefined;
      return { message, code };
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'error_message' in payload) {
    return { message: String((payload as Record<string, unknown>).error_message) };
  }
  return { message: 'Erro na Graph API da Meta.' };
}

// ---------------------------------------------------------------------------------------------
// Messenger (graph.facebook.com, token da página)
// ---------------------------------------------------------------------------------------------

export async function metaGet(path: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetch(metaGraphUrl(path, params), { signal: AbortSignal.timeout(15_000) });
  const payload = await parseMetaResponse(response);
  if (!response.ok) { const { message, code } = metaErrorMessage(payload); throw new MetaApiError(message, response.status, code); }
  return payload;
}

export async function metaPost(path: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetch(metaGraphUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await parseMetaResponse(response);
  if (!response.ok) { const { message, code } = metaErrorMessage(payload); throw new MetaApiError(message, response.status, code); }
  return payload;
}

export type MetaPage = { id: string; name: string; access_token: string };

/** Páginas do Facebook que o usuário administra, cada uma com o token para falar em nome dela. */
export async function listMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  const data = await metaGet('/me/accounts', { access_token: userAccessToken, fields: 'id,name,access_token' });
  const list = data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data) ? (data as { data: unknown[] }).data : [];
  return list.filter((item): item is MetaPage => Boolean(item && typeof item === 'object' && typeof (item as MetaPage).id === 'string'));
}

/** Envia texto pelo Messenger de uma página. */
export async function sendMessengerText(pageAccessToken: string, recipientId: string, text: string): Promise<unknown> {
  return metaPost('/me/messages', { access_token: pageAccessToken, recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text }) });
}

// ---------------------------------------------------------------------------------------------
// Instagram (graph.instagram.com / api.instagram.com, token da própria conta)
// ---------------------------------------------------------------------------------------------

async function instagramFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const payload = await parseMetaResponse(response);
  if (!response.ok) { const { message, code } = metaErrorMessage(payload); throw new MetaApiError(message, response.status, code); }
  return payload;
}

/** Troca o código do login do Instagram por um token de curta duração. */
export async function exchangeInstagramCode(params: Record<string, string>): Promise<{ accessToken: string; userId: string }> {
  const payload = await instagramFetch(INSTAGRAM_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error('O Instagram não devolveu um token de acesso.');
  return { accessToken, userId: String(payload.user_id ?? '') };
}

/** Troca o token de curta duração por um de longa duração (~60 dias). */
export async function exchangeInstagramLongLivedToken(params: Record<string, string>): Promise<string> {
  const url = new URL(INSTAGRAM_LONG_LIVED_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const payload = await instagramFetch(url.toString()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error('O Instagram não devolveu o token de longa duração.');
  return accessToken;
}

export type InstagramAccount = { id: string; username: string | null };

/** Conta do Instagram dona do token (a pessoa só autoriza a própria conta, não escolhe entre várias). */
export async function getInstagramAccount(accessToken: string): Promise<InstagramAccount> {
  const payload = await instagramFetch(`${INSTAGRAM_GRAPH_BASE}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`) as Record<string, unknown>;
  const id = String(payload.user_id ?? payload.id ?? '');
  if (!id) throw new Error('Não foi possível identificar a conta do Instagram.');
  return { id, username: typeof payload.username === 'string' ? payload.username : null };
}

/** Envia texto por uma conta do Instagram. */
export async function sendInstagramText(accessToken: string, recipientId: string, text: string): Promise<unknown> {
  return instagramFetch(`${INSTAGRAM_GRAPH_BASE}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken, recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text }) }).toString(),
  });
}

/** Mensagem amigável para quem está respondendo pelo Inbox. */
export function friendlyMetaSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/access token|session has expired|re-?authenticate/i.test(message)) return 'O acesso a esta conexão da Meta expirou. Reconecte em Conexões.';
  return `A Meta não aceitou o envio: ${message.slice(0, 200)}`;
}
