import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { sendWhatsappText } from '@/lib/inbox-send';
import { MEDIA_BUCKET } from '@/lib/inbox-attachments';

export const dynamic = 'force-dynamic';
// Envio de mídia pode levar alguns segundos (a D-API baixa o arquivo e envia ao WhatsApp).
export const maxDuration = 60;

/**
 * POST /api/inbox/send  { conversationId, text, attachment? }
 * Envia a resposta do atendente pelo WhatsApp (D-API). A chave da D-API fica só no servidor
 * e o acesso à conversa segue as regras do Supabase para o usuário logado.
 * attachment = { path, mimetype, filename, size, voice? } de um arquivo já enviado ao Storage.
 */
export async function POST(request: Request) {
  try {
    const supabase = (await createClient()) as any;
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      return NextResponse.json({ success: false, error: 'Faça login para continuar.' }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    const payload = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : '';
    const text = typeof payload.text === 'string' ? payload.text : '';

    // Nome que aparece em cima da mensagem no Inbox (vem do perfil do atendente).
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name,email')
      .eq('id', auth.user.id)
      .maybeSingle();
    const fullName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
    const emailName = typeof profile?.email === 'string' ? profile.email.split('@')[0] : '';
    const senderName = fullName || emailName || null;

    // Gravações e link do arquivo com a chave de serviço, depois de o acesso à conversa já ter sido validado.
    const writeClient = createAdminClient() ?? supabase;
    const signUrl = async (path: string) => {
      const { data, error } = await writeClient.storage.from(MEDIA_BUCKET).createSignedUrl(path, 600);
      return error || !data?.signedUrl ? null : (data.signedUrl as string);
    };

    const outcome = await sendWhatsappText(
      supabase,
      { userId: auth.user.id, senderName, conversationId, text, attachment: payload.attachment },
      (path, requestBody, options) => dapiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
      }),
      writeClient,
      signUrl,
    );
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[Inbox send failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Falha ao enviar a mensagem.' }, { status: 500 });
  }
}
