// Regras do período de teste gratuito. Funções puras, usadas pelo middleware,
// pelo aviso no app e pelos textos públicos.

export const DEFAULT_TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialOrganization = {
  status?: string | null;
  trial_ends_at?: string | null;
};

/** Normaliza o prazo vindo do banco; qualquer valor inválido cai no padrão. */
export function normalizeTrialDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) return DEFAULT_TRIAL_DAYS;
  return Math.floor(parsed);
}

/** "7 dias" / "1 dia". */
export function trialDaysLabel(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`;
}

/** Dias restantes (arredondado para cima). null quando a empresa não está em teste com prazo definido. */
export function trialDaysLeft(organization: TrialOrganization, now: Date = new Date()): number | null {
  if (organization.status !== 'trial' || !organization.trial_ends_at) return null;
  const endsAt = Date.parse(organization.trial_ends_at);
  if (!Number.isFinite(endsAt)) return null;
  return Math.max(0, Math.ceil((endsAt - now.getTime()) / DAY_MS));
}

/** Só expira quem está em teste e tem data de fim no passado. Sem data, não bloqueia. */
export function isTrialExpired(organization: TrialOrganization, now: Date = new Date()): boolean {
  if (organization.status !== 'trial' || !organization.trial_ends_at) return false;
  const endsAt = Date.parse(organization.trial_ends_at);
  return Number.isFinite(endsAt) && endsAt <= now.getTime();
}

/**
 * Bloqueia o acesso apenas quando o usuário enxerga ao menos uma empresa e todas
 * estão com o teste vencido. Quem tem alguma empresa ativa (ou é Super Admin e
 * enxerga empresas ativas) continua entrando.
 */
export function shouldBlockForExpiredTrial(organizations: TrialOrganization[], now: Date = new Date()): boolean {
  return organizations.length > 0 && organizations.every(organization => isTrialExpired(organization, now));
}

/** Empresa sem acesso: teste vencido ou suspensa (assinatura cancelada ou não paga). */
export function isOrganizationBlocked(organization: TrialOrganization, now: Date = new Date()): boolean {
  return organization.status === 'suspended' || isTrialExpired(organization, now);
}

/**
 * Bloqueia quando o usuário enxerga ao menos uma empresa e todas estão sem acesso
 * (teste vencido ou suspensa). Uma empresa ativa já libera a entrada.
 */
export function shouldBlockAccess(organizations: TrialOrganization[], now: Date = new Date()): boolean {
  return organizations.length > 0 && organizations.every(organization => isOrganizationBlocked(organization, now));
}

/** Rotas que continuam acessíveis mesmo com o teste vencido ou a empresa suspensa. */
export function isTrialExemptPath(pathname: string): boolean {
  return pathname === '/teste-encerrado' ||
    pathname === '/assinatura' ||
    pathname.startsWith('/api/billing/') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/auth/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/');
}
