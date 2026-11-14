import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { WEBCHAT_CORS_HEADERS, isValidWebchatPublicKey } from '@/lib/webchat';
import { startWebchatSession, type WebchatWidget } from '@/lib/webchat-server';

export const dynamic = 'force-dynamic';

type Context = { params: { publicKey: string } };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: WEBCHAT_CORS_HEADERS });

/** O site do cliente está numa origem diferente da do TendiDesk: o navegador manda isto antes do POST. */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS_HEADERS });
}

async function loadWidget(admin: ReturnType<typeof createAdminClient>, publicKey: string): Promise<WebchatWidget | null> {
  if (!admin || !isValidWebchatPublicKey(publicKey)) return null;
  const { data } = await admin.from('webchat_widgets').select('id,organization_id,is_enabled,display_name,greeting_message,color').eq('public_key', publicKey).maybeSingle();
  return data as WebchatWidget | null;
}

/**
 * GET /api/webchat/<publicKey>
 * Configuração pública do widget (nome, saudação, cor): o que o bolinha de chat mostra antes
 * mesmo de começar a conversa. Nada sensível aqui.
 */
export async function GET(_request: Request, { params }: Context) {
  const admin = createAdminClient();
  const widget = await loadWidget(admin, params.publicKey);
  if (!widget || !widget.is_enabled) return json({ error: 'Widget não encontrado.' }, 404);
  return json({ displayName: widget.display_name, greetingMessage: widget.greeting_message, color: widget.color });
}

/**
 * POST /api/webchat/<publicKey>
 * Começa uma conversa nova: cria o contato e a conversa, devolve um token para o navegador
 * guardar (localStorage) e usar nas próximas chamadas.
 */
export async function POST(_request: Request, { params }: Context) {
  const admin = createAdminClient();
  if (!admin) return json({ error: 'Servidor sem credenciais do banco.' }, 503);
  const widget = await loadWidget(admin, params.publicKey);
  if (!widget || !widget.is_enabled) return json({ error: 'Widget não encontrado.' }, 404);

  try {
    const session = await startWebchatSession(admin, widget);
    return json({ token: session.token, conversationId: session.conversationId });
  } catch (error) {
    console.error('[Webchat] falha ao iniciar sessão', { publicKey: params.publicKey, message: error instanceof Error ? error.message : String(error) });
    return json({ error: 'Não foi possível iniciar a conversa.' }, 500);
  }
}
