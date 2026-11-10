/** Funções puras do Inbox (sem rede e sem banco), fáceis de testar. */

export type MessageLike = { id: string; created_at: string };

/** Junta listas de mensagens sem duplicar (a lista mais nova prevalece) e ordena da mais antiga para a mais nova. */
export function mergeMessages<T extends MessageLike>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const message of list) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at < b.created_at ? -1 : 1));
}

/** Só aceita links http(s). Impede `javascript:` e similares vindos de dados externos. */
export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';
const MEDIA_KINDS: MediaKind[] = ['image', 'video', 'audio', 'document', 'sticker'];

export function mediaKind(messageType: string): MediaKind | null {
  return (MEDIA_KINDS as string[]).includes(messageType) ? (messageType as MediaKind) : null;
}

export const MEDIA_LABEL: Record<MediaKind, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  sticker: 'Figurinha',
};

const MEDIA_ICON: Record<MediaKind, string> = { image: '📷', video: '🎥', audio: '🎧', document: '📄', sticker: '🏷️' };

/** Texto curto da última mensagem para a lista de conversas. */
export function previewText(message: { body: string | null; message_type: string } | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.body && message.body.trim()) return message.body;
  const kind = mediaKind(message.message_type);
  if (kind) return `${MEDIA_ICON[kind]} ${MEDIA_LABEL[kind]}`;
  return fallback;
}

export const MAX_TAGS = 15;
export const MAX_TAG_LENGTH = 30;

/** Adiciona uma etiqueta sem duplicar (ignora maiúsculas/minúsculas). */
export function addTag(tags: string[], raw: string): { tags: string[]; error?: string } {
  const tag = raw.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!tag) return { tags };
  if (tag.length > MAX_TAG_LENGTH) return { tags, error: `A etiqueta pode ter até ${MAX_TAG_LENGTH} caracteres.` };
  if (tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) return { tags, error: 'Essa etiqueta já existe.' };
  if (tags.length >= MAX_TAGS) return { tags, error: `Limite de ${MAX_TAGS} etiquetas por contato.` };
  return { tags: [...tags, tag] };
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'open': return 'Atendimento em andamento';
    case 'pending': return 'Pendente';
    case 'snoozed': return 'Adiada';
    case 'closed': return 'Encerrada';
    default: return status;
  }
}
