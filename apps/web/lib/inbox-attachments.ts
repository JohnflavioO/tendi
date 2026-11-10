/**
 * Anexos do Inbox: tipos aceitos, limites, validação e montagem do pedido da D-API.
 * Funções puras (sem rede e sem banco).
 *
 * Os arquivos vão do navegador direto para o Supabase Storage (bucket privado "inbox-media"),
 * em `<organization_id>/<conversation_id>/<uuid>-<nome>`. O servidor gera um link temporário
 * assinado e a D-API baixa o arquivo por ele.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

export const MEDIA_BUCKET = 'inbox-media';
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024; // limite de mídia do WhatsApp
export const MAX_CAPTION_LENGTH = 1024;

const MIME_BY_KIND: Record<AttachmentKind, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/x-m4a'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
  ],
};

export const ALLOWED_MIME_TYPES: string[] = Object.values(MIME_BY_KIND).flat();

/** Valor para o atributo `accept` do seletor de arquivos. */
export const ATTACHMENT_ACCEPT = ALLOWED_MIME_TYPES.join(',');

/** "Audio/OGG; codecs=opus" -> "audio/ogg" */
export function normalizeMime(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase();
}

export function kindFromMime(raw: string): AttachmentKind | null {
  const mime = normalizeMime(raw);
  for (const kind of Object.keys(MIME_BY_KIND) as AttachmentKind[]) {
    if (MIME_BY_KIND[kind].includes(mime)) return kind;
  }
  return null;
}

export const KIND_LABEL: Record<AttachmentKind, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Documento' };

/** Remove caminhos, caracteres de controle e símbolos perigosos; mantém a extensão. */
export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^\p{L}\p{N}._ ()\-]/gu, '_').replace(/\s+/g, ' ').trim();
  const cleaned = base.replace(/^\.+/, '');
  if (!cleaned) return 'arquivo';
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 120 - ext.length) + ext;
}

export function buildStoragePath(organizationId: string, conversationId: string, filename: string, uniqueId: string): string {
  return `${organizationId}/${conversationId}/${uniqueId}-${sanitizeFilename(filename)}`;
}

/** Erro (em português) para mostrar antes de enviar o arquivo ao Storage, ou null se estiver ok. */
export function checkFileBeforeUpload(file: { type: string; size: number }): string | null {
  if (!file.size) return 'O arquivo está vazio.';
  if (file.size > MAX_ATTACHMENT_BYTES) return `O arquivo passa do limite de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB do WhatsApp.`;
  if (!kindFromMime(file.type)) return 'Tipo de arquivo não suportado. Envie imagem, vídeo, áudio, PDF, Word, Excel, PowerPoint, texto ou ZIP.';
  return null;
}

export type AttachmentInput = { path: string; mimetype: string; filename: string; size: number; voice?: boolean };
export type ValidAttachment = AttachmentInput & { kind: AttachmentKind };

/** Valida o anexo recebido pela API. O caminho precisa estar dentro da pasta da empresa e da conversa. */
export function validateAttachment(raw: unknown, organizationId: string, conversationId: string): { ok: true; value: ValidAttachment } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Anexo inválido.' };
  const input = raw as Record<string, unknown>;
  const path = typeof input.path === 'string' ? input.path : '';
  const prefix = `${organizationId}/${conversationId}/`;
  if (!path.startsWith(prefix) || path.length <= prefix.length || path.length > 400 || path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    return { ok: false, error: 'Anexo fora da pasta desta conversa.' };
  }
  const mimetype = normalizeMime(typeof input.mimetype === 'string' ? input.mimetype : '');
  const kind = kindFromMime(mimetype);
  if (!kind) return { ok: false, error: 'Tipo de arquivo não suportado.' };
  const size = typeof input.size === 'number' ? input.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'Tamanho do arquivo inválido.' };
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `O arquivo passa do limite de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.` };
  const filename = sanitizeFilename(typeof input.filename === 'string' ? input.filename : '');
  const voice = input.voice === true && kind === 'audio' && mimetype === 'audio/ogg';
  return { ok: true, value: { path, mimetype, filename, size, voice, kind } };
}

/** Rota e corpo do pedido à D-API para cada tipo de mídia (campos conforme a documentação da D-API). */
export function buildDapiMediaRequest(
  attachment: ValidAttachment,
  context: { sessionId: string; to: string; url: string; caption: string | null },
): { path: string; body: Record<string, unknown> } {
  const base = { sessionId: context.sessionId, to: context.to };
  const caption = context.caption ? { caption: context.caption } : {};
  switch (attachment.kind) {
    case 'image': return { path: '/messages/send/image', body: { ...base, image: context.url, ...caption } };
    case 'video': return { path: '/messages/send/video', body: { ...base, video: context.url, ...caption } };
    case 'audio': return { path: '/messages/send/audio', body: { ...base, audio: context.url, ptt: attachment.voice === true } };
    case 'document': return { path: '/messages/send/document', body: { ...base, document: context.url, fileName: attachment.filename, mimetype: attachment.mimetype, ...caption } };
  }
}
