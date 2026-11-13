import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { WEBCHAT_CORS_HEADERS, checkWebchatMessage } from '@/lib/webchat';
import { loadWebchatSession, listWebchatMessagesSince, postWebchatMessage } from '@/lib/webchat-server';
import { runAiAutoReply } from '@/lib/ai-reply';
import { generateReply } from '@/lib/ai-llm';
import { resolveProviderKey } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: WEBCHAT_CORS_HEADERS });

/** O site do cliente está numa origem diferente da do Tendi: o navegador manda isto antes do POST. */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS_HEADERS });
}

/** Resposta automática da IA para o Webchat: igual ao WhatsApp, só que sem provedor externo para entregar. */
async function replyWithAi(admin: ReturnType<typeof createAdminClient>, trigger: { organizationId: string; conversationId: string; messageId: string }) {
  if (!admin) return;
  try {
    const result = await runAiAutoReply(admin as any, trigger, {
      generate: generateReply,
      resolveKey: provider => resolveProviderKey(admin as any, provider),
      send: async () => ({}), // Webchat: a resposta já fica salva como enviada; não há provedor para chamar.
    });
    console.info('[Webchat][IA] resposta automática', { conversationId: trigger.conversationId, ...result });
  } catch (error) {
    console.error('[Webchat][IA] falha na resposta automática', { conversationId: trigger.conversationId, message: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * GET /api/webchat/messages?token=...&after=<ISO>
 * O widget consulta esta rota a cada poucos segundos para buscar novas mensagens (da equipe,
 * da IA, ou o eco da própria mensagem enviada).
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) return json({ error: 'Servidor sem credenciais do banco.' }, 503);
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const after = url.searchParams.get('after');

  const session = await loadWebchatSession(admin, token);
  if (!session) return json({ error: 'Sessão inválida ou vencida.' }, 401);

  const messages = await listWebchatMessagesSince(admin, session.conversationId, after);
  return json({ messages });
}

/**
 * POST /api/webchat/messages   { token, text }
 * Mensagem do visitante. Se a conversa estiver com a IA ligada, a resposta automática roda
 * depois do 200 (waitUntil), igual ao webhook do WhatsApp.
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) return json({ error: 'Servidor sem credenciais do banco.' }, 503);

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const token = typeof input.token === 'string' ? input.token : '';
  const checked = checkWebchatMessage(input.text);
  if (!checked.ok) return json({ error: checked.error }, 400);

  const session = await loadWebchatSession(admin, token);
  if (!session) return json({ error: 'Sessão inválida ou vencida.' }, 401);

  const result = await postWebchatMessage(admin, session, checked.text);
  if (!result.ok) return json({ error: result.error }, result.status);

  if (result.aiMode === 'on') {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(replyWithAi(admin, { organizationId: session.organizationId, conversationId: session.conversationId, messageId: result.messageId }));
  }
  return json({ success: true, messageId: result.messageId });
}
