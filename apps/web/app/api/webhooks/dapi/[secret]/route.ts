import { NextResponse } from 'next/server';
import { getDapiWebhookSecret } from '@/lib/dapi';

type Context = { params: { secret: string } };

/**
 * Phase 1 webhook ingress.
 * Phase 3 will add event validation, persistence and asynchronous processing.
 * For now, acknowledge valid callbacks immediately so D-API does not retry
 * while the rest of the webhook pipeline is being implemented.
 */
export async function POST(request: Request, { params }: Context) {
  let expectedSecret: string;

  try {
    expectedSecret = getDapiWebhookSecret();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Webhook não configurado.' },
      { status: 503 },
    );
  }

  if (!params.secret || params.secret !== expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado.' },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (payload && typeof payload === 'object') {
    console.info('[D-API webhook accepted]', {
      event: typeof payload.event === 'string' ? payload.event : 'unknown',
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
      traceId: typeof payload.traceId === 'string' ? payload.traceId : undefined,
    });
  }

  return NextResponse.json({ success: true, received: true }, { status: 200 });
}
