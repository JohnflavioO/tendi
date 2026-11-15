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
export async function listMetaPages(userAccessToken: string, appAccessToken: string | null = envAppAccessToken()): Promise<MetaPage[]> {
  const data = await metaGet('/me/accounts', { access_token: userAccessToken, fields: 'id,name,access_token' });
  const list = data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data) ? (data as { data: unknown[] }).data : [];
  const pages = list.filter((item): item is MetaPage => Boolean(item && typeof item === 'object' && typeof (item as MetaPage).id === 'string'));
  if (pages.length || !appAccessToken) return pages;
  // Login do Facebook para Empresas: /me/accounts pode vir vazio mesmo com a Página marcada.
  const found: MetaPage[] = [];
  for (const pageId of await grantedPageIds(userAccessToken, appAccessToken)) {
    const page = await metaGet(`/${pageId}`, { access_token: userAccessToken, fields: 'id,name,access_token' }).catch(() => null) as Partial<MetaPage> | null;
    if (page && typeof page.id === 'string' && typeof page.access_token === 'string') found.push({ id: page.id, name: typeof page.name === 'string' ? page.name : 'Página', access_token: page.access_token });
  }
  return found;
}

/**
 * Quando nenhuma Página aparece: resume o que a Meta liberou (permissões e ids) e o erro de cada
 * Página, sem expor tokens. Vai para a tela, para saber onde a conexão parou.
 */
export async function diagnoseMetaPages(userAccessToken: string, appAccessToken: string | null = envAppAccessToken()): Promise<string> {
  if (!appAccessToken) return 'META_APP_ID/META_APP_SECRET ausentes no servidor.';
  let scopes: Array<{ scope?: unknown; target_ids?: unknown }>;
  try {
    const data = await metaGet('/debug_token', { input_token: userAccessToken, access_token: appAccessToken });
    const info = (data as { data?: { granular_scopes?: Array<{ scope?: unknown; target_ids?: unknown }>; type?: unknown; is_valid?: unknown } })?.data;
    scopes = info?.granular_scopes ?? [];
    if (!scopes.length) return `Token sem permissões detalhadas (tipo: ${String(info?.type ?? '?')}, válido: ${String(info?.is_valid ?? '?')}).`;
  } catch (error) {
    return `debug_token falhou: ${error instanceof Error ? error.message : String(error)}`;
  }
  const parts = scopes.map(item => `${String(item.scope)}${Array.isArray(item.target_ids) ? ` [${item.target_ids.join(',')}]` : ''}`);
  const errors: string[] = [];
  for (const pageId of await grantedPageIds(userAccessToken, appAccessToken).catch(() => [])) {
    try {
      const page = await metaGet(`/${pageId}`, { access_token: userAccessToken, fields: 'id,name,access_token' }) as Record<string, unknown>;
      errors.push(`${pageId}: ${typeof page.access_token === 'string' ? 'ok' : 'sem token da Página'}`);
    } catch (error) {
      errors.push(`${pageId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return `Permissões: ${parts.join('; ')}${errors.length ? ` | Páginas: ${errors.join('; ')}` : ''}`.slice(0, 600);
}

/** Token do app (id|chave) para o debug_token; null se o app não estiver configurado. */
function envAppAccessToken(): string | null {
  const id = process.env.META_APP_ID?.trim();
  const secret = process.env.META_APP_SECRET?.trim();
  return id && secret ? `${id}|${secret}` : null;
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

export class InstagramAccountNotFoundError extends Error {
  constructor() {
    super('Nenhuma conta do Instagram vinculada foi encontrada nas páginas autorizadas.');
    this.name = 'InstagramAccountNotFoundError';
  }
}

type PageWithInstagram = { id?: unknown; access_token?: unknown; instagram_business_account?: unknown };

function pickInstagram(page: PageWithInstagram): InstagramAccount | null {
  const ig = page.instagram_business_account as { id?: unknown; username?: unknown } | undefined;
  if (ig && typeof ig.id === 'string' && typeof page.id === 'string' && typeof page.access_token === 'string') {
    return { id: ig.id, username: typeof ig.username === 'string' ? ig.username : null, pageId: page.id, pageAccessToken: page.access_token };
  }
  return null;
}

/**
 * Páginas liberadas no login, lidas das permissões do token (debug_token → granular_scopes).
 * No Login do Facebook para Empresas os ativos são escolhidos no portfólio empresarial e o
 * /me/accounts pode vir vazio, mas as permissões trazem os ids das Páginas autorizadas.
 */
async function grantedPageIds(userAccessToken: string, appAccessToken: string): Promise<string[]> {
  const data = await metaGet('/debug_token', { input_token: userAccessToken, access_token: appAccessToken });
  const scopes = (data as { data?: { granular_scopes?: Array<{ scope?: unknown; target_ids?: unknown }> } })?.data?.granular_scopes ?? [];
  const ids = new Set<string>();
  for (const item of scopes) {
    if (typeof item.scope !== 'string' || !item.scope.startsWith('pages_') || !Array.isArray(item.target_ids)) continue;
    for (const id of item.target_ids) if (typeof id === 'string') ids.add(id);
  }
  return [...ids];
}

/**
 * Acha a conta do Instagram autorizada e a Página do Facebook ligada a ela (o token da Página é
 * o que envia as mensagens). Primeiro pelo /me/accounts; se vier vazio (comum no login
 * empresarial), pelas Páginas que aparecem nas permissões do token.
 */
export async function getInstagramAccount(userAccessToken: string, appAccessToken: string | null = envAppAccessToken()): Promise<InstagramAccount> {
  const data = await metaGet('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,access_token,instagram_business_account{id,username}',
  });
  const list = data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data) ? (data as { data: unknown[] }).data : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const found = pickInstagram(item as PageWithInstagram);
    if (found) return found;
  }
  if (appAccessToken) {
    for (const pageId of await grantedPageIds(userAccessToken, appAccessToken)) {
      const page = await metaGet(`/${pageId}`, { access_token: userAccessToken, fields: 'id,access_token,instagram_business_account{id,username}' }).catch(() => null);
      const found = page && typeof page === 'object' ? pickInstagram(page as PageWithInstagram) : null;
      if (found) return found;
    }
  }
  throw new InstagramAccountNotFoundError();
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
