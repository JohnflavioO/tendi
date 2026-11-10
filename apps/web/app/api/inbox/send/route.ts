import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { sendWhatsappText } from '@/lib/inbox-send';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inbox/send  { conversationId, text }
 * Envia a resposta do atendente pelo WhatsApp (D-API). A chave da D-API fica só no servidor
 * e o acesso à conversa segue as regras do Supabase para o usuário logado.
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

    const outcome = await sendWhatsappText(
      supabase,
      { userId: auth.user.id, senderName, conversationId, text },
      (path, requestBody) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(requestBody) }),
      // Gravações com a chave de serviço (depois de o acesso à conversa já ter sido validado acima).
      createAdminClient() ?? supabase,
    );
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[Inbox send failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Falha ao enviar a mensagem.' }, { status: 500 });
  }
}
