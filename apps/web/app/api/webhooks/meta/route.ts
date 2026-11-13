import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { metaChannelFromObject, parseMetaWebhookBody, verifyMetaSignature } from '@/lib/meta';
import { getMetaAppSecret, getMetaWebhookVerifyToken } from '@/lib/meta-client';
import { processMetaEvent } from '@/lib/meta-webhook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/webhooks/meta
 * Confirmação de endereço pedida pelo Meta for Developers ao cadastrar o Webhook
 * (Messenger e Instagram usam o mesmo endereço; o que muda é o "object" de cada evento recebido).
 */
export async function GET(request: Request) {
  let verifyToken: string;
  try { verifyToken = getMetaWebhookVerifyToken(); } catch { return NextResponse.json({ error: 'Webhook da Meta não configurado.' }, { status: 503 }); }

  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
}

/** POST /api/webhooks/meta — eventos de mensagem do Messenger e do Instagram. */
export async function POST(request: Request) {
  let appSecret: string;
  try { appSecret = getMetaAppSecret(); } catch { return NextResponse.json({ error: 'Webhook da Meta não configurado.' }, { status: 503 }); }

  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  const body: unknown = JSON.parse(rawBody || '{}');
  const channel = metaChannelFromObject((body as Record<string, unknown>).object);
  // 200 para o que não reconhecemos: a Meta para de reentregar se vir 4xx/5xx.
  if (!channel) return NextResponse.json({ success: true, handled: false });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const events = parseMetaWebhookBody(body);
  for (const event of events) {
    try {
      const result = await processMetaEvent(admin as any, channel, event);
      console.info('[Meta webhook]', { channel, pageId: event.pageId, mid: event.mid, handled: result.handled, reason: result.reason });
    } catch (error) {
      console.error('[Meta webhook failed]', { channel, pageId: event.pageId, mid: event.mid, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ success: true, handled: events.length > 0 });
}
