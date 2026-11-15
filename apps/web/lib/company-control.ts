/**
 * Controle de empresas pelo Console Super Admin: regras puras.
 * O Console administra a CONTA (situação, plano, exclusão). Ele não lê conversas, contatos, CRM ou agenda.
 */
import { complimentaryLabel, isComplimentaryActive, isComplimentaryExpired, type ComplimentaryOrganization } from './complimentary';
import { isTrialExpired, trialDaysLeft } from './trial';

export const INTERNAL_ORGANIZATION_SLUG = 'tendi';

/** A empresa da própria plataforma: não pode ser suspensa nem excluída pelo Console. */
export const isInternalOrganization = (organization: { slug?: string | null } | null | undefined): boolean =>
  organization?.slug === INTERNAL_ORGANIZATION_SLUG;

/** Excluir exige digitar o nome exato da empresa (ignora maiúsculas e espaços nas pontas). */
export function confirmsDeletion(typed: unknown, organizationName: string): boolean {
  return typeof typed === 'string' && typed.trim().length > 0 && typed.trim().toLowerCase() === organizationName.trim().toLowerCase();
}

/**
 * Situação ao reativar uma empresa suspensa: volta para "em teste" se o teste ainda está valendo
 * e ela não tem assinatura ativa; senão, fica ativa.
 */
export function statusAfterReactivation(input: { trialEndsAt: string | null; hasActiveSubscription: boolean }, now: Date = new Date()): 'trial' | 'active' {
  const trialRunning = input.trialEndsAt ? Date.parse(input.trialEndsAt) > now.getTime() : false;
  return trialRunning && !input.hasActiveSubscription ? 'trial' : 'active';
}

export const ORGANIZATION_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Ativa', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  trial: { label: 'Em teste', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  suspended: { label: 'Bloqueada', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  cancelled: { label: 'Cancelada', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

// ---------- Situação da empresa na tabela do Console ----------

export type SituationKey = 'paying' | 'past_due' | 'trial' | 'expired' | 'suspended' | 'complimentary' | 'no_subscription';
export type Situation = { key: SituationKey; label: string; tone: string };

/** Situações que pedem atenção do Super Admin. */
export const ATTENTION_SITUATIONS: SituationKey[] = ['past_due', 'expired', 'suspended'];

/**
 * Situação de cada empresa no Console. A cortesia vem antes da cobrança: empresa liberada não
 * aparece como pagante nem como "pagamento pendente". Cortesia vencida sem assinatura pede atenção.
 */
export function organizationSituation(
  org: { status: string; trial_ends_at: string | null } & ComplimentaryOrganization,
  subscription: { status: string } | null | undefined,
  now: Date = new Date(),
): Situation {
  if (org.status === 'suspended') return { key: 'suspended', label: 'Suspensa', tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
  if (isComplimentaryActive(org, now)) return { key: 'complimentary', label: complimentaryLabel(org, now), tone: 'bg-[#FBF0FA] text-[#A8087F] ring-[#F3C9EA]' };
  if (subscription?.status === 'past_due') return { key: 'past_due', label: 'Pagamento pendente', tone: 'bg-amber-50 text-amber-700 ring-amber-200' };
  if (subscription?.status === 'active') return { key: 'paying', label: 'Pagante', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (isComplimentaryExpired(org, now)) return { key: 'expired', label: 'Cortesia vencida', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
  if (org.status === 'trial') {
    if (isTrialExpired(org, now)) return { key: 'expired', label: 'Teste vencido', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
    const days = trialDaysLeft(org, now);
    return { key: 'trial', label: days === null ? 'Em teste' : `Teste · ${days} ${days === 1 ? 'dia' : 'dias'}`, tone: 'bg-sky-50 text-sky-700 ring-sky-200' };
  }
  return { key: 'no_subscription', label: 'Ativa sem assinatura', tone: 'bg-violet-50 text-violet-700 ring-violet-200' };
}

/** Receita mensal que a empresa gera. Cortesia nunca entra na receita. */
export function monthlyRevenue(
  situation: Situation,
  subscription: { status: string; billing_period?: string | null } | null | undefined,
  plan: { monthly_price?: number | string | null; annual_price?: number | string | null } | null | undefined,
): number {
  if (situation.key === 'complimentary' || !subscription || subscription.status === 'canceled' || !plan) return 0;
  return subscription.billing_period === 'annual' ? Number(plan.annual_price ?? 0) / 12 : Number(plan.monthly_price ?? 0);
}
