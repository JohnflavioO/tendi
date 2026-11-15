import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { metaChannelFromObject, parseMetaWebhookBody, verifyMetaSignature } from '@/lib/meta';
import { getMetaAppSecret, getMetaWebhookVerifyToken, sendInstagramText } from '@/lib/meta-client';
import { processMetaEvent } from '@/lib/meta-webhook';
import { runAiAutoReply, type AiTrigger } from '@/lib/ai-reply';
import { generateReply } from '@/lib/ai-llm';
import { resolveProviderKey } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Resposta automática da IA no Instagram, entregue pela Graph API com o token da página (Vault). */
async function replyWithAi(admin: Admin, trigger: AiTrigger) {
  try {
    const result = await runAiAutoReply(admin as any, trigger, {
      generate: generateReply,
      resolveKey: provider => resolveProviderKey(admin as any, provider),
      send: async () => { throw new Error('Envio pela D-API não se aplica ao Instagram.'); },
      sendInstagram: async ({ connectionId, accountId, recipientId, text }) => {
        const { data: token, error } = await (admin as any).rpc('get_channel_secret', { p_connection_id: connectionId });
        if (error || typeof token !== 'string' || !token) throw new Error('Token do Instagram não encontrado. Reconecte o Instagram em Conexões (access token).');
        return sendInstagramText(token, accountId, recipientId, text);
      },
    });
    console.info('[Instagram][IA] resposta automática', { conversationId: trigger.conversationId, ...result });
  } catch (error) {
    console.error('[Instagram][IA] falha na resposta automática', { conversationId: trigger.conversationId, message: error instanceof Error ? error.message : String(error) });
  }
}

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
  const aiTriggers: AiTrigger[] = [];
  for (const event of events) {
    try {
      const result = await processMetaEvent(admin as any, channel, event);
      console.info('[Meta webhook]', { channel, pageId: event.pageId, mid: event.mid, handled: result.handled, reason: result.reason, ai: Boolean(result.aiTrigger) });
      if (result.aiTrigger) aiTriggers.push(result.aiTrigger);
    } catch (error) {
      console.error('[Meta webhook failed]', { channel, pageId: event.pageId, mid: event.mid, message: error instanceof Error ? error.message : String(error) });
    }
  }
  // A IA responde depois do 200 (a Meta reentrega se demorarmos), igual ao webhook do WhatsApp.
  if (aiTriggers.length) {
    const { waitUntil } = await import('@vercel/functions');
    for (const trigger of aiTriggers) waitUntil(replyWithAi(admin, trigger));
  }
  return NextResponse.json({ success: true, handled: events.length > 0 });
}
