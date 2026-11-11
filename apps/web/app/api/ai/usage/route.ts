import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { monthStartIso, normalizeLimits, resolveMonthlyLimit, usageLevel } from '@/lib/ai-limits';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/ai/usage?organization=<id>
 * Uso da IA no mês para quem é da empresa: respostas usadas e limite (mesma regra da resposta automática).
 */
export async function GET(request: Request) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const organizationId = new URL(request.url).searchParams.get('organization') ?? '';
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });

  // As regras de acesso do usuário garantem que ele é da empresa.
  const { data: org } = await supabase.from('organizations').select('id,status,plan_code').eq('id', organizationId).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ enabled: false });

  const [{ data: agent }, { data: plan }, { data: setting }, used] = await Promise.all([
    admin.from('ai_agents').select('is_enabled,monthly_reply_limit').eq('organization_id', organizationId).maybeSingle(),
    org.plan_code ? admin.from('subscription_plans').select('ai_monthly_replies').eq('code', org.plan_code).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('platform_settings').select('value').eq('key', 'ai_limits').maybeSingle(),
    admin.from('ai_usage_events').select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('outcome', ['replied', 'handoff'])
      .gte('created_at', monthStartIso()),
  ]);
  if (!agent?.is_enabled) return NextResponse.json({ enabled: false });

  const limit = resolveMonthlyLimit({
    agentLimit: agent.monthly_reply_limit,
    planLimit: (plan as { ai_monthly_replies?: number | null } | null)?.ai_monthly_replies ?? null,
    isTrial: org.status === 'trial',
    settings: normalizeLimits(setting?.value),
  });
  const count = used.count ?? 0;
  return NextResponse.json({ enabled: true, used: count, limit, level: usageLevel(count, limit), trial: org.status === 'trial' });
}
