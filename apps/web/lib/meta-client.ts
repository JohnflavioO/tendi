import { metaGraphUrl } from './meta';

/**
 * Credenciais do app da Meta (Instagram/Messenger) e chamadas à Graph API.
 * Nada aqui é específico de uma empresa: META_APP_ID/META_APP_SECRET são o app único do Tendi
 * cadastrado no Meta for Developers. O token de cada página/conta fica no Vault (lib/meta-connect.ts).
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
  return { message: 'Erro na Graph API da Meta.' };
}

/** GET na Graph API. */
export async function metaGet(path: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetch(metaGraphUrl(path, params), { signal: AbortSignal.timeout(15_000) });
  const payload = await parseMetaResponse(response);
  if (!response.ok) { const { message, code } = metaErrorMessage(payload); throw new MetaApiError(message, response.status, code); }
  return payload;
}

/** POST na Graph API (ex.: enviar mensagem, inscrever webhook). */
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

export type MetaPage = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };

/** Páginas que o usuário administra, com o token de cada uma e a conta do Instagram ligada (se houver). */
export async function listMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  const data = await metaGet('/me/accounts', { access_token: userAccessToken, fields: 'id,name,access_token,instagram_business_account{id,username}' });
  const list = data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data) ? (data as { data: unknown[] }).data : [];
  return list.filter((item): item is MetaPage => Boolean(item && typeof item === 'object' && typeof (item as MetaPage).id === 'string'));
}

/** Envia texto pelo Messenger ou pela conta do Instagram ligada à página. */
export async function sendMetaText(channel: 'messenger' | 'instagram', pageAccessToken: string, recipientId: string, text: string): Promise<unknown> {
  return metaPost('/me/messages', {
    access_token: pageAccessToken,
    recipient: JSON.stringify({ id: recipientId }),
    message: JSON.stringify({ text }),
    ...(channel === 'instagram' ? { messaging_type: 'RESPONSE' } : {}),
  });
}

/** Mensagem amigável para quem está respondendo pelo Inbox. */
export function friendlyMetaSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/access token|session has expired|re-?authenticate/i.test(message)) return 'O acesso a esta conexão da Meta expirou. Reconecte em Conexões.';
  return `A Meta não aceitou o envio: ${message.slice(0, 200)}`;
}
