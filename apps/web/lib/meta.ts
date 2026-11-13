import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Instagram e Messenger (Meta): assinatura do webhook e leitura do formato de evento.
 * Funções puras (sem rede e sem banco). O envio e a troca de tokens ficam em lib/meta-client.ts.
 *
 * Os dois canais chegam pelo mesmo formato de webhook da Meta (Messenger Platform / Instagram
 * Messaging): um "entry" por página, cada um com uma lista "messaging". O mesmo parser serve
 * para os dois; quem diferencia é o campo `object` do corpo ("page" = Messenger, "instagram" = Instagram).
 */

export const META_GRAPH_VERSION = 'v21.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export function metaGraphUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${META_GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** Confere a assinatura "sha256=<hex>" do cabeçalho X-Hub-Signature-256. */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(match[1]!.toLowerCase(), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mensagens e Instagram agora entram pelo MESMO login (Login do Facebook para Empresas) e pelo
 * mesmo app (META_APP_ID/META_APP_SECRET) — a Meta aposentou o login próprio do Instagram
 * ("API setup with Instagram login") para apps criados recentemente; eles só têm a "API setup
 * with Unified login". A diferença entre os dois agora é só o parâmetro `config_id`: ele aponta
 * para uma "Configuração de login" cadastrada no painel da Meta (Instagram → API setup with
 * Unified login → Criar nova configuração), que já embute os ativos (Página + conta do Instagram)
 * e as permissões — por isso não mandamos mais `scope` no login do Instagram.
 */
export const MESSENGER_OAUTH_SCOPES = ['pages_show_list', 'pages_messaging', 'pages_manage_metadata'];

/** Login do Facebook (Messenger): escolhe entre as páginas que a pessoa administra. */
export function messengerDialogUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', MESSENGER_OAUTH_SCOPES.join(','));
  return url.toString();
}

/** Login do Instagram (Unified login): mesma tela do Facebook, autorizando a configuração indicada por `configId`. */
export function instagramDialogUrl(input: { appId: string; redirectUri: string; state: string; configId: string }): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('config_id', input.configId);
  return url.toString();
}

export type MetaChannel = 'messenger' | 'instagram';

/** "page" (webhook do Messenger) ou "instagram" (webhook do Instagram). null para o que não reconhecemos. */
export function metaChannelFromObject(object: unknown): MetaChannel | null {
  if (object === 'page') return 'messenger';
  if (object === 'instagram') return 'instagram';
  return null;
}

export type MetaMessageEvent = { pageId: string; senderId: string; text: string | null; kind: string; mid: string; timestamp: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MEDIA_LABEL: Record<string, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', file: 'Arquivo' };

/**
 * Extrai as mensagens de texto (e um aviso para anexos) de um corpo de webhook da Meta.
 * Ignora: eco da própria página (is_echo), confirmações de entrega/leitura e postbacks de botão
 * (ficam para uma próxima etapa).
 */
export function parseMetaWebhookBody(body: unknown): MetaMessageEvent[] {
  if (!isRecord(body) || !Array.isArray(body.entry)) return [];
  const events: MetaMessageEvent[] = [];
  for (const entry of body.entry) {
    if (!isRecord(entry)) continue;
    const pageId = typeof entry.id === 'string' ? entry.id : '';
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const item of messaging) {
      if (!isRecord(item)) continue;
      const message = isRecord(item.message) ? item.message : null;
      if (!message || message.is_echo === true) continue;
      const sender = isRecord(item.sender) ? item.sender : {};
      const senderId = typeof sender.id === 'string' ? sender.id : '';
      const mid = typeof message.mid === 'string' ? message.mid : '';
      if (!pageId || !senderId || !mid) continue;
      const timestampRaw = typeof item.timestamp === 'number' ? item.timestamp : Number(item.timestamp);
      const timestamp = Number.isFinite(timestampRaw) && timestampRaw > 0 ? new Date(timestampRaw).toISOString() : new Date().toISOString();
      const text = typeof message.text === 'string' && message.text.trim() ? message.text.trim() : null;
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const firstAttachmentType = attachments.length && isRecord(attachments[0]) ? String((attachments[0] as Record<string, unknown>).type ?? '') : '';
      events.push({
        pageId, senderId, mid, timestamp,
        kind: text ? 'text' : firstAttachmentType || 'unknown',
        text: text ?? (firstAttachmentType ? `[${MEDIA_LABEL[firstAttachmentType] ?? 'Anexo'}]` : null),
      });
    }
  }
  return events;
}

/** Parâmetros usados na troca de código por token (dialog/oauth -> oauth/access_token) do Facebook. */
export function metaAccessTokenParams(input: { appId: string; appSecret: string; redirectUri: string; code: string }): Record<string, string> {
  return { client_id: input.appId, client_secret: input.appSecret, redirect_uri: input.redirectUri, code: input.code };
}

/** Parâmetros para trocar um token de usuário do Facebook de curta duração por um de longa duração (~60 dias). */
export function metaLongLivedTokenParams(input: { appId: string; appSecret: string; shortLivedToken: string }): Record<string, string> {
  return { grant_type: 'fb_exchange_token', client_id: input.appId, client_secret: input.appSecret, fb_exchange_token: input.shortLivedToken };
}
