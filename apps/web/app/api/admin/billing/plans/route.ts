import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { buildPlanPayload, getPlatformSecret } from '@/lib/billing';
import { createPagarmeClient, PagarmeError, toCents } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/billing/plans { code, monthlyPrice }
 * Define o preço mensal do plano e publica o plano na Pagar.me.
 * Preço novo = plano novo na Pagar.me: quem já assina continua no preço antigo; novos assinantes pagam o novo.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const price = typeof body?.monthlyPrice === 'number' ? body.monthlyPrice : Number(body?.monthlyPrice);
  if (!Number.isFinite(price) || price < 1 || price > 100_000) {
    return NextResponse.json({ error: 'Informe um valor mensal entre R$ 1,00 e R$ 100.000,00.' }, { status: 400 });
  }
  const monthlyPrice = Math.round(price * 100) / 100;

  const { data: plan } = await auth.admin.from('subscription_plans')
    .select('code,name,description,pagarme_plan_id,pagarme_plan_price')
    .eq('code', code)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });

  const key = await getPlatformSecret(auth.admin, 'pagarme_secret_key');
  if (!key) return NextResponse.json({ error: 'Conecte a Pagar.me (chave secreta) antes de publicar os planos.' }, { status: 409 });

  let pagarmePlanId = plan.pagarme_plan_id as string | null;
  if (!pagarmePlanId || Number(plan.pagarme_plan_price) !== monthlyPrice) {
    try {
      const created = await createPagarmeClient(key)<{ id?: string }>('/plans', { method: 'POST', body: buildPlanPayload(plan, toCents(monthlyPrice)) });
      if (!created?.id) throw new PagarmeError('A Pagar.me não devolveu o id do plano.', 502);
      pagarmePlanId = created.id;
    } catch (error) {
      return NextResponse.json({ error: error instanceof PagarmeError ? error.message : 'Falha ao criar o plano na Pagar.me.' }, { status: 502 });
    }
  }

  const { error } = await auth.admin.from('subscription_plans')
    .update({ monthly_price: monthlyPrice, pagarme_plan_id: pagarmePlanId, pagarme_plan_price: monthlyPrice, updated_at: new Date().toISOString() })
    .eq('code', code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, monthlyPrice, pagarmePlanId });
}
