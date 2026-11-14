import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_ATTACHMENT_BYTES, MEDIA_BUCKET, normalizeMime } from './inbox-attachments';
import { downloadFilename, isFetchableMediaUrl, resolveMediaSource, sniffImageMime, type MediaSource } from './inbox-media';

/**
 * Lê o arquivo de mídia de uma mensagem no servidor (para baixar e encaminhar).
 * O acesso é validado lendo a mensagem com o cliente do usuário: as regras do
 * Supabase só devolvem mensagens das empresas dele.
 */

type Db = SupabaseClient<any, any, any>;

export type LoadedMedia = {
  message: { id: string; organization_id: string; conversation_id: string; body: string | null; created_at: string };
  source: MediaSource;
  bytes: ArrayBuffer;
  mimetype: string;
  filename: string;
};

export type MediaFailure = { status: number; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadMessageMedia(userDb: Db, storageDb: Db, messageId: string): Promise<LoadedMedia | MediaFailure> {
  if (!UUID_RE.test(messageId)) return { status: 400, error: 'Mensagem inválida.' };

  const { data, error } = await userDb
    .from('messages')
    .select('id,organization_id,conversation_id,message_type,body,created_at,payload')
    .eq('id', messageId)
    .maybeSingle();
  if (error) return { status: 500, error: 'Não foi possível consultar a mensagem.' };
  if (!data) return { status: 404, error: 'Mensagem não encontrada.' };

  const source = resolveMediaSource(data);
  if (!source) return { status: 422, error: 'Esta mensagem não tem arquivo.' };

  let bytes: ArrayBuffer;
  let mimetype = source.mimetype ?? '';

  if (source.storagePath) {
    // O arquivo precisa estar na pasta da empresa dona da mensagem.
    if (!source.storagePath.startsWith(`${data.organization_id}/`) || source.storagePath.includes('..')) {
      return { status: 422, error: 'Arquivo fora da pasta desta empresa.' };
    }
    const download = await storageDb.storage.from(MEDIA_BUCKET).download(source.storagePath);
    if (download.error || !download.data) return { status: 404, error: 'O arquivo não está mais disponível.' };
    bytes = await download.data.arrayBuffer();
    if (!mimetype) mimetype = normalizeMime(download.data.type ?? '');
  } else if (source.url) {
    if (!isFetchableMediaUrl(source.url)) return { status: 422, error: 'O link deste arquivo não pode ser aberto pelo servidor.' };
    let response: Response;
    try {
      response = await fetch(source.url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    } catch {
      return { status: 502, error: 'Não foi possível buscar o arquivo no WhatsApp. Ele pode ter expirado.' };
    }
    if (!response.ok) return { status: 502, error: 'O arquivo não está mais disponível no WhatsApp.' };
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > MAX_ATTACHMENT_BYTES) return { status: 413, error: 'O arquivo é grande demais.' };
    bytes = await response.arrayBuffer();
    if (!mimetype) mimetype = normalizeMime(response.headers.get('content-type') ?? '');
  } else {
    return { status: 404, error: 'O arquivo desta mensagem não está disponível.' };
  }

  if (!bytes.byteLength) return { status: 502, error: 'O arquivo veio vazio.' };
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return { status: 413, error: 'O arquivo é grande demais.' };
  // Imagens: confia no conteúdo do arquivo quando a origem não informa um tipo de imagem.
  if ((source.kind === 'image' || source.kind === 'sticker') && !mimetype.startsWith('image/')) {
    mimetype = sniffImageMime(bytes) ?? mimetype;
  }

  return {
    message: { id: data.id, organization_id: data.organization_id, conversation_id: data.conversation_id, body: data.body, created_at: data.created_at },
    source,
    bytes,
    mimetype: mimetype || 'application/octet-stream',
    filename: downloadFilename({ kind: source.kind, filename: source.filename, mimetype, createdAt: data.created_at }),
  };
}

export const isMediaFailure = (value: LoadedMedia | MediaFailure): value is MediaFailure => 'error' in value;
