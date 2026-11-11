import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCheckoutPayload, getPlatformSecret, isBillingPeriod, type BillingPeriod } from '@/lib/billing';
import { createPagarmeClient, PagarmeError } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REUSE_MS = 30 * 60 * 1000;

/**
 * POST /api/billing/checkout { organizationId, planCode, period? ('monthly' | 'annual') }
 * Dono ou admin do workspace pede o checkout de um plano. Devolve a URL do checkout da Pagar.me
 * (página hospedada por ela: o Tendi nunca vê dados de cartão).
 */
export async function POST(request: Request) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const planCode = typeof body?.planCode === 'string' ? body.planCode : '';
  const period: BillingPeriod = isBillingPeriod(body?.period) ? body.period : 'monthly';
  if (!UUID_RE.test(organizationId) || !planCode) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  // Só dono/admin da empresa (ou o Super Admin) assina. As consultas usam as regras de acesso do usuário.
  const [{ data: membership }, { data: superAdmin }] = await Promise.all([
    supabase.from('organization_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle(),
  ]);
  if (!superAdmin && (!membership || !['owner', 'admin'].includes(membership.role))) {
    return NextResponse.json({ error: 'Só o responsável pelo workspace pode assinar um plano.' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Cobrança indisponível no momento.' }, { status: 503 });

  const [{ data: org }, { data: plan }, { data: current }, { data: profile }] = await Promise.all([
    admin.from('organizations').select('id,name').eq('id', organizationId).maybeSingle(),
    admin.from('subscription_plans').select('code,name,is_active,monthly_price,pagarme_plan_id,annual_price,pagarme_annual_plan_id').eq('code', planCode).maybeSingle(),
    admin.from('billing_subscriptions').select('status').eq('organization_id', organizationId).maybeSingle(),
    admin.from('profiles').select('full_name,email').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (!org) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
  const pagarmePlanId = (period === 'annual' ? plan?.pagarme_annual_plan_id : plan?.pagarme_plan_id) as string | null | undefined;
  const price = period === 'annual' ? plan?.annual_price : plan?.monthly_price;
  if (!plan?.is_active || !pagarmePlanId || !price) {
    return NextResponse.json({ error: 'Este plano ainda não está disponível para assinatura.' }, { status: 409 });
  }
  if (current && current.status !== 'canceled') {
    return NextResponse.json({ error: 'Este workspace já tem uma assinatura. Para trocar de plano, fale com o suporte.' }, { status: 409 });
  }

  // Reaproveita um link recente do mesmo plano (evita criar vários por cliques repetidos).
  const since = new Date(Date.now() - REUSE_MS).toISOString();
  const { data: recent } = await admin.from('billing_checkouts')
    .select('url')
    .eq('organization_id', organizationId)
    .eq('plan_code', planCode)
    .eq('billing_period', period)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.url) return NextResponse.json({ url: recent.url });

  const key = await getPlatformSecret(admin, 'pagarme_secret_key');
  if (!key) return NextResponse.json({ error: 'Cobrança ainda não configurada. Fale com o suporte.' }, { status: 503 });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  const email = (profile?.email as string | undefined) ?? auth.user.email ?? null;
  try {
    const link = await createPagarmeClient(key)<{ id?: string; url?: string }>('/paymentlinks', {
      method: 'POST',
      body: buildCheckoutPayload({
        organizationId,
        organizationName: org.name,
        planName: period === 'annual' ? `${plan.name} Anual` : plan.name,
        pagarmePlanId,
        customerName: (profile?.full_name as string | undefined)?.trim() || org.name,
        customerEmail: email,
        successUrl: `${origin}/assinatura?organization=${organizationId}&checkout=concluido`,
        logoUrl: `${origin}/brand/tendi-logo-light.png`,
      }),
    });
    if (!link?.id || !link.url) throw new PagarmeError('A Pagar.me não devolveu o link de pagamento.', 502);
    await admin.from('billing_checkouts').insert({ organization_id: organizationId, plan_code: planCode, billing_period: period, provider_link_id: link.id, url: link.url, created_by: auth.user.id });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error('[Pagar.me checkout]', { organizationId, planCode, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' }, { status: 502 });
  }
}
