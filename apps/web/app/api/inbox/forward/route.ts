import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { sendWhatsappText } from '@/lib/inbox-send';
import { MAX_CAPTION_LENGTH, MEDIA_BUCKET, buildStoragePath, kindFromMime } from '@/lib/inbox-attachments';
import { isMediaFailure, loadMessageMedia } from '@/lib/inbox-media-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TARGETS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/inbox/forward  { messageId, conversationIds: string[], includeCaption?: boolean }
 * Encaminha a mídia de uma mensagem para outras conversas do mesmo workspace.
 * O arquivo é copiado para a pasta de cada conversa de destino e enviado pelo fluxo normal de envio.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as any;
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) return NextResponse.json({ success: false, error: 'Faça login para continuar.' }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const messageId = typeof input.messageId === 'string' ? input.messageId : '';
    const targets = Array.isArray(input.conversationIds)
      ? [...new Set(input.conversationIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)))]
      : [];
    if (!targets.length) return NextResponse.json({ success: false, error: 'Escolha pelo menos uma conversa.' }, { status: 400 });
    if (targets.length > MAX_TARGETS) return NextResponse.json({ success: false, error: `Encaminhe para até ${MAX_TARGETS} conversas por vez.` }, { status: 400 });

    const writeClient = createAdminClient() ?? supabase;
    const media = await loadMessageMedia(supabase, writeClient, messageId);
    if (isMediaFailure(media)) return NextResponse.json({ success: false, error: media.error }, { status: media.status });
    if (!kindFromMime(media.mimetype)) {
      return NextResponse.json({ success: false, error: 'Este tipo de arquivo não pode ser encaminhado pelo WhatsApp.' }, { status: 422 });
    }

    // Só encaminha dentro do mesmo workspace da mensagem original (e só para conversas que o usuário enxerga).
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id,organization_id')
      .in('id', targets);
    if (conversationsError) return NextResponse.json({ success: false, error: 'Não foi possível consultar as conversas.' }, { status: 500 });
    const allowed = new Set(((conversations ?? []) as Array<{ id: string; organization_id: string }>)
      .filter(row => row.organization_id === media.message.organization_id)
      .map(row => row.id));

    const { data: profile } = await supabase.from('profiles').select('full_name,email').eq('id', auth.user.id).maybeSingle();
    const fullName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
    const emailName = typeof profile?.email === 'string' ? profile.email.split('@')[0] : '';
    const senderName = fullName || emailName || null;

    const signUrl = async (path: string) => {
      const { data, error } = await writeClient.storage.from(MEDIA_BUCKET).createSignedUrl(path, 600);
      return error || !data?.signedUrl ? null : (data.signedUrl as string);
    };
    const caption = input.includeCaption === false || media.source.kind === 'audio' ? '' : (media.message.body ?? '').trim().slice(0, MAX_CAPTION_LENGTH);

    const results: Array<{ conversationId: string; success: boolean; error?: string }> = [];
    for (const conversationId of targets) {
      if (!allowed.has(conversationId)) {
        results.push({ conversationId, success: false, error: 'Conversa não encontrada neste workspace.' });
        continue;
      }
      const path = buildStoragePath(media.message.organization_id, conversationId, media.filename, crypto.randomUUID());
      const upload = await writeClient.storage.from(MEDIA_BUCKET).upload(path, media.bytes, { contentType: media.mimetype, upsert: false });
      if (upload.error) {
        results.push({ conversationId, success: false, error: 'Não foi possível copiar o arquivo.' });
        continue;
      }
      const outcome = await sendWhatsappText(
        supabase,
        {
          userId: auth.user.id,
          senderName,
          conversationId,
          text: caption,
          attachment: { path, mimetype: media.mimetype, filename: media.filename, size: media.bytes.byteLength },
        },
        (requestPath, requestBody, options) => dapiRequest<unknown>(requestPath, {
          method: 'POST',
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
        }),
        writeClient,
        signUrl,
      );
      const ok = outcome.status === 200;
      results.push({ conversationId, success: ok, ...(ok ? {} : { error: typeof outcome.body.error === 'string' ? outcome.body.error : 'Falha ao enviar.' }) });
    }

    const sent = results.filter(result => result.success).length;
    return NextResponse.json({ success: sent > 0, sent, results }, { status: sent > 0 ? 200 : 502 });
  } catch (error) {
    console.error('[Inbox forward failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Falha ao encaminhar.' }, { status: 500 });
  }
}
