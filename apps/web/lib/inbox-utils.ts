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

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias" ou a data (dd/mm). */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  const diff = now.getTime() - at.getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Cores fortes para etiquetas: a mesma etiqueta sempre ganha a mesma cor. */
export const TAG_TONES = [
  'bg-blue-600 text-white',
  'bg-pink-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-500 text-white',
  'bg-violet-600 text-white',
  'bg-cyan-600 text-white',
  'bg-rose-600 text-white',
  'bg-teal-600 text-white',
] as const;

export function tagTone(tag: string): string {
  let hash = 0;
  for (const char of tag.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length]!;
}

export type InboxTab = 'novos' | 'meus' | 'outros' | 'todas';

/** Aba da conversa: Novos (sem responsável), Meus (comigo), Outros (com colegas). Encerradas só em "Todas". */
export function inboxTabOf(conversation: { assigned_to: string | null; status: string }, userId: string): Exclude<InboxTab, 'todas'> | null {
  if (conversation.status === 'closed') return null;
  if (!conversation.assigned_to) return 'novos';
  return conversation.assigned_to === userId ? 'meus' : 'outros';
}

export type ConversationTag = { label: string; className: string };

/** Etiquetas da conversa: fluxo (IA atendendo / aguardando atendente) e etiquetas do contato. */
export function conversationTags(input: { aiMode?: string | null; contactTags?: string[] | null }): ConversationTag[] {
  const tags: ConversationTag[] = [];
  if (input.aiMode === 'on') tags.push({ label: 'Fluxo IA', className: 'bg-[#1D1F4E] text-white' });
  if (input.aiMode === 'handoff') tags.push({ label: 'Aguardando atendente', className: 'bg-orange-500 text-white' });
  for (const tag of input.contactTags ?? []) if (tag.trim()) tags.push({ label: tag.trim(), className: tagTone(tag) });
  return tags;
}
