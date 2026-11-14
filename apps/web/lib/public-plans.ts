/**
 * Planos para o site público: preço mensal/anual e limites, lidos do banco (o que o Super Admin
 * configura no Console). Revalida a cada 5 minutos. Em qualquer falha usa os valores de reserva,
 * para o site nunca ficar sem preço.
 */

export type PublicPlan = {
  code: string;
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  aiMonthlyReplies: number | null;
  maxUsers: number | null;
  maxTeams: number | null;
  boleto: boolean;
};

export const FALLBACK_PLANS: PublicPlan[] = [
  { code: 'tendi_start', name: 'TendiDesk Start', monthlyPrice: 189, annualPrice: 1927.8, aiMonthlyReplies: 1000, maxUsers: 4, maxTeams: null, boleto: false },
  { code: 'tendi_pro', name: 'TendiDesk Pro', monthlyPrice: 289, annualPrice: 2947.8, aiMonthlyReplies: 3000, maxUsers: 10, maxTeams: 10, boleto: true },
];

const num = (value: unknown): number | null => {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) && n > 0 ? n : null;
};

export function toPublicPlans(rows: unknown): PublicPlan[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && typeof (row as any).code === 'string')
    .map(row => ({
      code: String(row.code),
      name: String(row.name ?? row.code),
      monthlyPrice: num(row.monthly_price),
      annualPrice: num(row.annual_price),
      aiMonthlyReplies: num(row.ai_monthly_replies),
      maxUsers: num(row.max_attendants),
      maxTeams: num(row.max_teams),
      boleto: row.boleto_second_copy_enabled === true,
    }));
}

export async function getPublicPlans(): Promise<PublicPlan[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return FALLBACK_PLANS;
  try {
    const columns = 'code,name,monthly_price,annual_price,ai_monthly_replies,max_attendants,max_teams,boleto_second_copy_enabled';
    const response = await fetch(`${url}/rest/v1/subscription_plans?select=${columns}&is_active=eq.true&order=display_order.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return FALLBACK_PLANS;
    const plans = toPublicPlans(await response.json());
    return plans.length ? plans : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

/** Desconto do anual sobre 12 mensalidades (inteiro) e valores derivados para exibição. */
export function annualOffer(plan: PublicPlan): { perMonth: number; total: number; savings: number; percent: number } | null {
  if (!plan.monthlyPrice || !plan.annualPrice) return null;
  const full = plan.monthlyPrice * 12;
  if (plan.annualPrice >= full) return null;
  return {
    perMonth: Math.round((plan.annualPrice / 12) * 100) / 100,
    total: plan.annualPrice,
    savings: Math.round((full - plan.annualPrice) * 100) / 100,
    percent: Math.round(((full - plan.annualPrice) / full) * 100),
  };
}
