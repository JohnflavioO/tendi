import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformSecret, processPagarmeEvent } from '@/lib/billing';
import { createPagarmeClient } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

type Context = { params: { secret: string } };

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Webhook da Pagar.me.
 * - Autenticação: segredo no caminho da URL (gerado no painel de Pagamentos).
 * - O conteúdo do evento não é confiável por si só: a assinatura é sempre consultada na API.
 * - 200 para eventos tratados, repetidos ou ignorados; 5xx em falha real (a Pagar.me reenvia).
 */
export async function POST(request: Request, { params }: Context) {
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const [expected, secretKey] = await Promise.all([
    getPlatformSecret(db, 'pagarme_webhook_secret'),
    getPlatformSecret(db, 'pagarme_secret_key'),
  ]);
  if (!expected || !secretKey) return NextResponse.json({ error: 'Cobrança não configurada.' }, { status: 503 });
  if (!params.secret || !same(params.secret, expected)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const payload: unknown = await request.json().catch(() => null);
  try {
    const outcome = await processPagarmeEvent(db, createPagarmeClient(secretKey), payload);
    const event = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    console.info('[Pagar.me webhook]', { id: event.id, type: event.type, ...outcome.body });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[Pagar.me webhook failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Falha ao processar o evento.' }, { status: 500 });
  }
}
