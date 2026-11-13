/**
 * Controle de empresas pelo Console Super Admin: regras puras.
 * O Console administra a CONTA (situação, plano, exclusão). Ele não lê conversas, contatos, CRM ou agenda.
 */

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
