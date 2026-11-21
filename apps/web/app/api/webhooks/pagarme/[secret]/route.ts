import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformSecret, processPagarmeEvent } from '@/lib/billing';
import { createPagarmeClient } from '@/lib/pagarme';
import { setupEventOrderId, confirmSetupOrder } from '@/lib/business-setup-payment';

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
    const eventType = payload && typeof payload==='object' ? String((payload as Record<string,unknown>).type??'') : '';
    const orderId = setupEventOrderId(payload);
    if(orderId && eventType==='order.paid'){
      const api=createPagarmeClient(secretKey);
      const order=await api<Record<string,unknown>>(`/orders/${encodeURIComponent(orderId)}`);
      const code=typeof order.code==='string'?order.code:'';
      if(code.startsWith('TENDI-SETUP-')){
        const orgId=code.slice('TENDI-SETUP-'.length);
        const row=await db.from('business_onboardings').select('*').eq('organization_id',orgId).eq('setup_payment_order_code',code).maybeSingle();
        if(row.error)throw new Error('Erro consultando cobrança de implantação');
        if(row.data?.setup_payment_status==='pending'){
          const valid=await confirmSetupOrder(api,orderId,{organizationId:orgId,amountCents:row.data.setup_fee_cents,orderCode:code});
          if(!valid)return NextResponse.json({ignored:'setup_order_unverified'},{status:200});
          const saved=await db.from('business_onboardings').update({setup_payment_status:'paid',setup_payment_order_id:orderId,setup_paid_at:new Date().toISOString(),setup_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('organization_id',orgId).eq('setup_payment_status','pending').select('organization_id').maybeSingle();
          if(saved.error)throw new Error('Erro registrando pagamento de implantação');
          if(saved.data)await db.from('business_onboarding_events').insert({organization_id:orgId,from_status:row.data.status,to_status:row.data.status,notes:'Implantação paga (webhook verificado): '+orderId});
          return NextResponse.json({ok:true,setup: saved.data?'paid':'already_processed'});
        }
        return NextResponse.json({ignored:'setup_not_pending'});
      }
    }
    const outcome = await processPagarmeEvent(db, createPagarmeClient(secretKey), payload);
    const event = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    console.info('[Pagar.me webhook]', { id: event.id, type: event.type, ...outcome.body });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[Pagar.me webhook failed]', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Falha ao processar o evento.' }, { status: 500 });
  }
}
