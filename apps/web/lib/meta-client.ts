import { metaGraphUrl } from './meta';

/**
 * Credenciais do app da Meta (Instagram/Messenger) e chamadas à Graph API.
 * Messenger e Instagram usam HOJE o mesmo app (META_APP_ID/META_APP_SECRET) e o mesmo login —
 * a Meta aposentou o login próprio do Instagram para apps novos; eles só têm a "API setup with
 * Unified login", que é o Login do Facebook para Empresas com uma "Configuração de login"
 * (META_INSTAGRAM_CONFIG_ID) que já embute os ativos (Página + conta do Instagram) autorizados.
 * O token de cada página/conta fica no Vault (migration dos canais), nunca aqui.
 */

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

export function getInstagramConfigId(): string {
  const value = process.env.META_INSTAGRAM_CONFIG_ID?.trim();
  if (!value) throw new Error('META_INSTAGRAM_CONFIG_ID não está configurada no servidor.');
  return value;
}

/** Messenger está pronto para conectar (ID/chave do app + token do webhook). */
export function isMessengerConfigured(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim() && process.env.META_WEBHOOK_VERIFY_TOKEN?.trim());
}

/** Instagram está pronto para conectar (mesmo ID/chave do app + a Configuração de login própria + token do webhook). */
export function isInstagramConfigured(): boolean {
  return Boolean(
    process.env.META_APP_ID?.trim() &&
    process.env.META_APP_SECRET?.trim() &&
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
    process.env.META_INSTAGRAM_CONFIG_ID?.trim(),
  );
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
// Graph API (graph.facebook.com) — usada por Messenger e, agora, também pelo Instagram.
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
// Instagram (Unified login): a conta do Instagram vem presa a uma Página do Facebook — a mesma
// Configuração de login já autoriza as duas. Por isso buscamos a conta pelo /me/accounts, com o
// campo instagram_business_account, e enviamos as mensagens com o token da PÁGINA (não um token
// próprio do Instagram, que não existe mais nesse fluxo).
// ---------------------------------------------------------------------------------------------

export type InstagramAccount = { id: string; username: string | null; pageId: string; pageAccessToken: string };

/**
 * Entre as páginas do usuário, acha a primeira com uma conta do Instagram vinculada. A
 * Configuração de login (config_id) já restringe o login a uma única Página + conta, então
 * normalmente só virá uma.
 */
export async function getInstagramAccount(userAccessToken: string): Promise<InstagramAccount> {
  const data = await metaGet('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,access_token,instagram_business_account{id,username}',
  });
  const list = data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data) ? (data as { data: unknown[] }).data : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const page = item as { id?: unknown; access_token?: unknown; instagram_business_account?: unknown };
    const ig = page.instagram_business_account as { id?: unknown; username?: unknown } | undefined;
    if (ig && typeof ig.id === 'string' && typeof page.id === 'string' && typeof page.access_token === 'string') {
      return { id: ig.id, username: typeof ig.username === 'string' ? ig.username : null, pageId: page.id, pageAccessToken: page.access_token };
    }
  }
  throw new Error('Nenhuma conta do Instagram vinculada foi encontrada nas páginas autorizadas.');
}

/** Envia texto por uma conta do Instagram, usando o token da Página do Facebook vinculada a ela. */
export async function sendInstagramText(pageAccessToken: string, instagramAccountId: string, recipientId: string, text: string): Promise<unknown> {
  return metaPost(`/${instagramAccountId}/messages`, { access_token: pageAccessToken, recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text }) });
}

/** Mensagem amigável para quem está respondendo pelo Inbox. */
export function friendlyMetaSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/access token|session has expired|re-?authenticate/i.test(message)) return 'O acesso a esta conexão da Meta expirou. Reconecte em Conexões.';
  return `A Meta não aceitou o envio: ${message.slice(0, 200)}`;
}
