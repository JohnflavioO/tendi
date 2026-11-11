import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { buildPlanPayload, getPlatformSecret, isBillingPeriod, readPlanPrice, type BillingPeriod } from '@/lib/billing';
import { createPagarmeClient, PagarmeError, toCents } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/billing/plans
 *  { code, pagarmePlanId, period? } -> vincula um plano que já existe na Pagar.me/Stone (confere na API e lê o preço);
 *                                      period 'annual' vincula a versão anual (com desconto) do plano
 *  { code, monthlyPrice }   -> cria o plano na Pagar.me com esse preço
 * Preço novo = plano novo: quem já assina continua no preço antigo; novos assinantes pagam o novo.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const linkId = typeof body?.pagarmePlanId === 'string' ? body.pagarmePlanId.trim() : '';
  const period: BillingPeriod = isBillingPeriod(body?.period) ? body.period : 'monthly';

  const { data: plan } = await auth.admin.from('subscription_plans')
    .select('code,name,description,pagarme_plan_id,pagarme_plan_price')
    .eq('code', code)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });

  const key = await getPlatformSecret(auth.admin, 'pagarme_secret_key');
  if (!key) return NextResponse.json({ error: 'Conecte a Pagar.me (chave secreta) antes de publicar ou vincular os planos.' }, { status: 409 });
  const api = createPagarmeClient(key);

  let pagarmePlanId: string;
  let monthlyPrice: number;

  if (linkId) {
    if (!/^plan_[A-Za-z0-9]{8,40}$/.test(linkId)) return NextResponse.json({ error: 'O ID do plano começa com "plan_".' }, { status: 400 });
    // O mesmo plano da Pagar.me não pode ser a versão mensal de um e a anual de outro.
    const column = period === 'annual' ? 'pagarme_plan_id' : 'pagarme_annual_plan_id';
    const { data: clash } = await auth.admin.from('subscription_plans').select('code').eq(column, linkId).maybeSingle();
    if (clash) return NextResponse.json({ error: `Este plano da Pagar.me já está vinculado como ${period === 'annual' ? 'mensal' : 'anual'}.` }, { status: 409 });
    try {
      const remote = await api<Record<string, any>>(`/plans/${encodeURIComponent(linkId)}`);
      const checked = readPlanPrice(remote, period);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });
      if (period === 'annual') {
        const { error } = await auth.admin.from('subscription_plans')
          .update({ pagarme_annual_plan_id: linkId, annual_price: checked.price, updated_at: new Date().toISOString() })
          .eq('code', code);
        if (error) {
          const duplicate = error.code === '23505';
          return NextResponse.json({ error: duplicate ? 'Este plano anual já está vinculado a outro plano do Tendi.' : error.message }, { status: duplicate ? 409 : 500 });
        }
        return NextResponse.json({ ok: true, period, price: checked.price, pagarmePlanId: linkId });
      }
      pagarmePlanId = linkId;
      monthlyPrice = checked.price;
    } catch (error) {
      const message = error instanceof PagarmeError && error.status === 404 ? 'Plano não encontrado nesta conta da Pagar.me. Confira o ID e se a chave é do mesmo ambiente.' : error instanceof PagarmeError ? error.message : 'Falha ao consultar o plano.';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    const price = typeof body?.monthlyPrice === 'number' ? body.monthlyPrice : Number(body?.monthlyPrice);
    if (!Number.isFinite(price) || price < 1 || price > 100_000) {
      return NextResponse.json({ error: 'Informe um valor mensal entre R$ 1,00 e R$ 100.000,00.' }, { status: 400 });
    }
    monthlyPrice = Math.round(price * 100) / 100;
    pagarmePlanId = plan.pagarme_plan_id as string;
    if (!pagarmePlanId || Number(plan.pagarme_plan_price) !== monthlyPrice) {
      try {
        const created = await api<{ id?: string }>('/plans', { method: 'POST', body: buildPlanPayload(plan, toCents(monthlyPrice)) });
        if (!created?.id) throw new PagarmeError('A Pagar.me não devolveu o id do plano.', 502);
        pagarmePlanId = created.id;
      } catch (error) {
        return NextResponse.json({ error: error instanceof PagarmeError ? error.message : 'Falha ao criar o plano na Pagar.me.' }, { status: 502 });
      }
    }
  }

  const { error } = await auth.admin.from('subscription_plans')
    .update({ monthly_price: monthlyPrice, pagarme_plan_id: pagarmePlanId, pagarme_plan_price: monthlyPrice, updated_at: new Date().toISOString() })
    .eq('code', code);
  if (error) {
    const duplicate = error.code === '23505';
    return NextResponse.json({ error: duplicate ? 'Este plano da Pagar.me já está vinculado a outro plano do Tendi.' : error.message }, { status: duplicate ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, monthlyPrice, pagarmePlanId });
}
