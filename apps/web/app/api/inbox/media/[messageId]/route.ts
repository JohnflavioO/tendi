import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMediaFailure, loadMessageMedia } from '@/lib/inbox-media-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Context = { params: { messageId: string } };

/**
 * GET /api/inbox/media/<messageId>
 * Devolve o arquivo da mensagem como download. Passa pelo servidor porque o link
 * original é de outro domínio (o navegador não baixa direto) e pode ser privado.
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const supabase = (await createClient()) as any;
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

    const media = await loadMessageMedia(supabase, createAdminClient() ?? supabase, params.messageId);
    if (isMediaFailure(media)) return NextResponse.json({ error: media.error }, { status: media.status });

    // Só tipos de mídia conhecidos saem com o tipo original; o resto vai como binário genérico.
    const contentType = /^(image|video|audio)\/[a-z0-9.+-]+$|^application\/pdf$/.test(media.mimetype) ? media.mimetype : 'application/octet-stream';
    return new NextResponse(media.bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(media.bytes.byteLength),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[Inbox media download failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Não foi possível baixar o arquivo.' }, { status: 500 });
  }
}
