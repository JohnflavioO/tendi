import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { changeSubscriptionPlan, getPlatformSecret } from '@/lib/billing';
import { createPagarmeClient } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/billing/change-plan { organizationId, planCode }
 * Dono/admin do workspace (ou o Super Admin) troca o plano de uma assinatura ativa.
 * Sem cobrança no dia: o valor novo vale a partir da próxima cobrança (ver changeSubscriptionPlan).
 */
export async function POST(request: Request) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const planCode = typeof body?.planCode === 'string' ? body.planCode : '';
  if (!UUID_RE.test(organizationId) || !planCode) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

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
    return NextResponse.json({ error: 'Só o responsável pelo workspace pode trocar o plano.' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Cobrança indisponível no momento.' }, { status: 503 });
  const key = await getPlatformSecret(admin, 'pagarme_secret_key');
  if (!key) return NextResponse.json({ error: 'Cobrança ainda não configurada. Fale com o suporte.' }, { status: 503 });

  try {
    const result = await changeSubscriptionPlan(admin, createPagarmeClient(key), { organizationId, planCode });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Pagar.me troca de plano]', { organizationId, planCode, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Não foi possível trocar o plano agora. Tente novamente em instantes; se o erro continuar, fale com o suporte.' }, { status: 502 });
  }
}
