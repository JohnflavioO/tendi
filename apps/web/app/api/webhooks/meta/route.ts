import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { metaChannelFromObject, parseMetaWebhookBody, verifyMetaSignature } from '@/lib/meta';
import { getMetaAppSecret, getMetaWebhookVerifyToken } from '@/lib/meta-client';
import { createMetaSender } from '@/lib/meta-send';
import { processMetaEvent } from '@/lib/meta-webhook';
import { runAiAutoReply, type AiTrigger } from '@/lib/ai-reply';
import { generateReply } from '@/lib/ai-llm';
import { resolveProviderKey } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Guarda o último aviso que a Meta mandou (hora, tipo, ids, se a assinatura bateu e se a conta
 * foi reconhecida), sem o conteúdo das mensagens. Serve para o "Verificar recebimento".
 */
async function recordWebhook(admin: Admin | null, value: Record<string, unknown>) {
  if (!admin) return;
  await admin.from('platform_settings').upsert({ key: 'meta_webhook_last', value: { at: new Date().toISOString(), ...value }, description: 'Último aviso recebido no webhook da Meta (diagnóstico, sem conteúdo de mensagens).' }, { onConflict: 'key' })
    .then(() => undefined, () => undefined);
}

function webhookSummary(body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const entries = Array.isArray(record.entry) ? record.entry as Array<Record<string, unknown>> : [];
  return {
    object: typeof record.object === 'string' ? record.object : null,
    entry_ids: entries.map(entry => String(entry.id ?? '')).slice(0, 5),
    has_messaging: entries.some(entry => Array.isArray(entry.messaging) && entry.messaging.length > 0),
    has_changes: entries.some(entry => Array.isArray(entry.changes) && entry.changes.length > 0),
  };
}

/** Resposta automática da IA no Instagram, entregue pela Graph API com o token da página (Vault). */
async function replyWithAi(admin: Admin, trigger: AiTrigger) {
  try {
    const result = await runAiAutoReply(admin as any, trigger, {
      generate: generateReply,
      resolveKey: provider => resolveProviderKey(admin as any, provider),
      send: async () => { throw new Error('Envio pela D-API não se aplica ao Instagram.'); },
      sendInstagram: input => createMetaSender(admin as any)({ ...input, channel: 'instagram' }),
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
    // Só registra quando parece vir da Meta (tem o cabeçalho), para saber se a chave do app está errada.
    if (request.headers.get('x-hub-signature-256')) {
      let parsed: unknown = null;
      try { parsed = JSON.parse(rawBody || '{}'); } catch { parsed = null; }
      await recordWebhook(createAdminClient(), { signature_ok: false, ...webhookSummary(parsed) });
    }
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
  const reasons: string[] = [];
  for (const event of events) {
    try {
      const result = await processMetaEvent(admin as any, channel, event);
      reasons.push(result.handled ? 'ok' : (result.reason ?? 'ignorada'));
      console.info('[Meta webhook]', { channel, pageId: event.pageId, mid: event.mid, handled: result.handled, reason: result.reason, ai: Boolean(result.aiTrigger) });
      if (result.aiTrigger) aiTriggers.push(result.aiTrigger);
    } catch (error) {
      console.error('[Meta webhook failed]', { channel, pageId: event.pageId, mid: event.mid, message: error instanceof Error ? error.message : String(error) });
    }
  }
  await recordWebhook(admin, { signature_ok: true, ...webhookSummary(body), events: events.length, results: reasons.slice(0, 5), matched: !reasons.includes('connection_not_found') });
  // A IA responde depois do 200 (a Meta reentrega se demorarmos), igual ao webhook do WhatsApp.
  if (aiTriggers.length) {
    const { waitUntil } = await import('@vercel/functions');
    for (const trigger of aiTriggers) waitUntil(replyWithAi(admin, trigger));
  }
  return NextResponse.json({ success: true, handled: events.length > 0 });
}
