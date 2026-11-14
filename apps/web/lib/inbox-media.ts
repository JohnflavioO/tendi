/**
 * Mídia das mensagens do Inbox: de onde vem o arquivo, nome para baixar e
 * validação do link externo. Funções puras (sem rede e sem banco).
 *
 * Uma mídia pode estar em dois lugares:
 *  - link externo da D-API (payload.media_url), nas mensagens recebidas;
 *  - Storage privado (payload.media.path), nas mensagens enviadas pela equipe.
 */
import { normalizeMime } from './inbox-attachments';
import { mediaKind, safeMediaUrl, type MediaKind } from './inbox-utils';

export type MediaMessageLike = { message_type: string; body?: string | null; payload: unknown };

export type MediaSource = {
  kind: MediaKind;
  /** Link externo http(s), quando existir. Tem prioridade sobre o Storage. */
  url: string | null;
  /** Caminho no bucket privado, quando não há link externo. */
  storagePath: string | null;
  mimetype: string | null;
  filename: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** Onde está a mídia de uma mensagem. null quando a mensagem não é de mídia. */
export function resolveMediaSource(message: MediaMessageLike): MediaSource | null {
  const kind = mediaKind(message.message_type);
  if (!kind) return null;
  const payload = isRecord(message.payload) ? message.payload : {};
  const stored = isRecord(payload.media) ? payload.media : null;
  const url = safeMediaUrl(payload.media_url);
  const storagePath = !url ? text(stored?.path) : null;
  const rawMime = text(payload.mimetype) ?? text(stored?.mimetype);
  return {
    kind,
    url,
    storagePath,
    mimetype: rawMime ? normalizeMime(rawMime) : null,
    filename: text(payload.filename) ?? text(stored?.filename),
  };
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

const NAME_BY_KIND: Record<MediaKind, string> = {
  image: 'imagem',
  sticker: 'figurinha',
  video: 'video',
  audio: 'audio',
  document: 'documento',
};

/** Nome do arquivo ao baixar: usa o nome original quando existe; senão "imagem-2026-11-12-0909.jpg". */
export function downloadFilename(input: { kind: MediaKind; filename?: string | null; mimetype?: string | null; createdAt?: string | null }): string {
  const original = (input.filename ?? '').split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').trim();
  if (original) return original.slice(0, 120);
  const extension = EXTENSION_BY_MIME[normalizeMime(input.mimetype ?? '')] ?? (input.kind === 'image' ? 'jpg' : input.kind === 'sticker' ? 'webp' : 'bin');
  const at = input.createdAt ? new Date(input.createdAt) : null;
  const stamp = at && Number.isFinite(at.getTime())
    ? `-${at.toISOString().slice(0, 10)}-${at.toISOString().slice(11, 16).replace(':', '')}`
    : '';
  return `${NAME_BY_KIND[input.kind]}${stamp}.${extension}`;
}

/**
 * O servidor só busca links externos seguros: https, porta padrão, nome de domínio público.
 * Bloqueia IPs literais e nomes internos para o link de uma mensagem nunca alcançar a rede interna.
 */
export function isFetchableMediaUrl(value: unknown): boolean {
  const safe = safeMediaUrl(value);
  if (!safe) return false;
  const url = new URL(safe);
  if (url.protocol !== 'https:') return false;
  if (url.port && url.port !== '443') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return false; // "localhost", nomes de rede interna
  if (/^[0-9.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false; // IP literal
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(host)) return false;
  return true;
}

/** Descobre o tipo de uma imagem pelos primeiros bytes, quando o servidor de origem não informa. */
export function sniffImageMime(bytes: ArrayBuffer): string | null {
  const head = new Uint8Array(bytes.slice(0, 12));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Imagens que o visualizador abre (fotos e figurinhas). */
export function isViewableImage(message: MediaMessageLike): boolean {
  const kind = mediaKind(message.message_type);
  return kind === 'image' || kind === 'sticker';
}
