import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

    const outcome = await sendWhatsappText(
      supabase,
      { userId: auth.user.id, conversationId, text },
      (path, requestBody) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(requestBody) }),
    );
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[Inbox send failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Falha ao enviar a mensagem.' }, { status: 500 });
  }
}
