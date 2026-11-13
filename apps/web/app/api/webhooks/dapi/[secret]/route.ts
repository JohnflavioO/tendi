import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { dapiRequest, getDapiWebhookSecret } from '@/lib/dapi';
import { processDapiEvent, type ProcessResult } from '@/lib/dapi-webhook';
import { handleReminderReply } from '@/lib/agenda-reminders-server';
import { runAiAutoReply, type AiTrigger } from '@/lib/ai-reply';
import { generateReply } from '@/lib/ai-llm';
import { resolveProviderKey } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';
// A resposta da IA roda depois do 200 (waitUntil): espera curta + chamada ao modelo + envio.
export const maxDuration = 60;

type Db = SupabaseClient<any, any, any>;
type ReminderCandidate = NonNullable<ProcessResult['reminderReply']>;

/** Resposta automática da IA. Nunca derruba o webhook: erros só vão para o log. */
async function replyWithAi(db: Db, trigger: AiTrigger) {
  try {
    const result = await runAiAutoReply(db as any, trigger, {
      generate: generateReply,
      resolveKey: provider => resolveProviderKey(db as any, provider),
      send: (path, body, options) => dapiRequest<unknown>(path, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options?.timeoutMs ?? 20_000),
      }),
    });
    console.info('[IA] resposta automática', { conversationId: trigger.conversationId, ...result });
  } catch (error) {
    console.error('[IA] falha na resposta automática', {
      conversationId: trigger.conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Depois de gravar a mensagem do cliente: primeiro vê se ela responde a um lembrete da agenda
 * (confirma ou pede para remarcar). Se responder, a agenda é atualizada e a IA não entra;
 * caso contrário, segue a resposta automática da IA quando ela estiver ligada na conversa.
 */
async function afterMessage(db: Db, reminderReply: ReminderCandidate | undefined, aiTrigger: AiTrigger | undefined) {
  if (reminderReply) {
    try {
      const outcome = await handleReminderReply(db as any, reminderReply, {
        send: (path, body) => dapiRequest<unknown>(path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) }),
      });
      if (outcome.handled) {
        console.info('[Agenda] resposta ao lembrete', { conversationId: reminderReply.conversationId, action: outcome.action, appointmentId: outcome.appointmentId });
        return;
      }
    } catch (error) {
      console.error('[Agenda] falha ao tratar resposta ao lembrete', { conversationId: reminderReply.conversationId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (aiTrigger) await replyWithAi(db, aiTrigger);
}

type Context = { params: { secret: string } };

class ConfigError extends Error {}

const HANDLED_EVENTS = new Set(['messages.received', 'connection.status', 'message.delivered', 'message.read']);

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ConfigError('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.');
  }
  // Chave de serviço: só no servidor. O webhook não tem sessão de usuário, então precisa dela para gravar.
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const ack = (extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: true, ...extra }, { status: 200 });

/**
 * Webhook da D-API.
 * - 401 se o segredo da URL não bater (a D-API não assina os webhooks).
 * - 200 para tudo o que for válido, inclusive eventos ignorados e sessões desconhecidas
 *   (a D-API para de entregar se receber 404/410).
 * - 5xx apenas em falha real de configuração/banco: a D-API repete a entrega e o processamento é idempotente.
 */
export async function POST(request: Request, { params }: Context) {
  let expectedSecret: string;
  try {
    expectedSecret = getDapiWebhookSecret();
  } catch {
    return NextResponse.json({ success: false, error: 'Webhook não configurado.' }, { status: 503 });
  }

  let decoded = params.secret ?? '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // mantém o valor original
  }
  if (!params.secret || (!secretMatches(params.secret, expectedSecret) && !secretMatches(decoded, expectedSecret))) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ack({ ignored: 'invalid_body' });

  const payload = body as Record<string, unknown>;
  const event = typeof payload.event === 'string' ? payload.event : '';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
  const traceId = typeof payload.traceId === 'string' ? payload.traceId : null;
  const data =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : {};
  if (!event || !sessionId) return ack({ ignored: 'missing_event_or_session' });
  // Eventos que ainda não tratamos (presence, chats, contatos...) são só reconhecidos, sem tocar no banco.
  if (!HANDLED_EVENTS.has(event)) return ack({ handled: false, reason: 'event_not_handled' });

  try {
    const db = adminClient();
    const result = await processDapiEvent(db, { event, sessionId, traceId, data });
    if (result.reminderReply || result.aiTrigger) waitUntil(afterMessage(db, result.reminderReply, result.aiTrigger));
    console.info('[D-API webhook]', {
      event,
      sessionId,
      traceId,
      messageId: typeof data.id === 'string' ? data.id : undefined,
      handled: result.handled,
      reason: result.reason,
    });
    return ack({ handled: result.handled, reason: result.reason });
  } catch (error) {
    console.error('[D-API webhook failed]', {
      event,
      sessionId,
      traceId,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ConfigError) {
      return NextResponse.json({ success: false, error: 'Servidor sem credenciais do banco.' }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: 'Falha ao processar o evento.' }, { status: 500 });
  }
}
