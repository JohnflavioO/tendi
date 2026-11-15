/**
 * Conta cortesia: o Super Admin libera uma empresa sem pagamento (parceiros, por exemplo).
 * Regras puras, usadas pelo Console, pelo bloqueio de acesso e pela sincronização da Pagar.me.
 *
 * - Cortesia ativa: a empresa fica "active", não cai em teste encerrado nem pagamento pendente
 *   e não conta como pagante na receita.
 * - Prazo opcional: sem data, vale até ser revogada. Com data, ao vencer a empresa fica sem
 *   acesso até assinar (como um teste encerrado).
 * - Revogar devolve a empresa ao fluxo normal de assinatura.
 */

export const COMPLIMENTARY_REASON_MAX = 300;
/** Prazo máximo de uma cortesia com data: 5 anos. */
const MAX_DAYS = 5 * 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ComplimentaryOrganization = {
  complimentary_since?: string | null;
  complimentary_until?: string | null;
};

const time = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** A empresa foi liberada como cortesia (vencida ou não). */
export function hasComplimentary(organization: ComplimentaryOrganization | null | undefined): boolean {
  return Boolean(organization?.complimentary_since);
}

/** Cortesia valendo agora: liberada e sem prazo, ou com prazo no futuro. */
export function isComplimentaryActive(organization: ComplimentaryOrganization | null | undefined, now: Date = new Date()): boolean {
  if (!hasComplimentary(organization)) return false;
  const until = time(organization?.complimentary_until);
  return until === null || until > now.getTime();
}

/** Cortesia com prazo que já passou: a empresa fica sem acesso até assinar. */
export function isComplimentaryExpired(organization: ComplimentaryOrganization | null | undefined, now: Date = new Date()): boolean {
  if (!hasComplimentary(organization)) return false;
  const until = time(organization?.complimentary_until);
  return until !== null && until <= now.getTime();
}

/** Dias restantes da cortesia com prazo (arredondado para cima). null quando não tem prazo ou não é cortesia. */
export function complimentaryDaysLeft(organization: ComplimentaryOrganization | null | undefined, now: Date = new Date()): number | null {
  if (!hasComplimentary(organization)) return null;
  const until = time(organization?.complimentary_until);
  if (until === null) return null;
  return Math.max(0, Math.ceil((until - now.getTime()) / DAY_MS));
}

/** "Cortesia", "Cortesia · 12 dias", "Cortesia vencida". */
export function complimentaryLabel(organization: ComplimentaryOrganization | null | undefined, now: Date = new Date()): string {
  if (isComplimentaryExpired(organization, now)) return 'Cortesia vencida';
  const days = complimentaryDaysLeft(organization, now);
  if (days === null) return 'Cortesia';
  return days === 0 ? 'Cortesia · último dia' : `Cortesia · ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export type ComplimentaryInput = { planCode: string; until: string | null; reason: string };

/**
 * Valida o pedido do Console. `until` chega como "AAAA-MM-DD" (fim do dia em Brasília) ou vazio.
 * Devolve o prazo já em ISO.
 */
export function parseComplimentaryInput(body: unknown, now: Date = new Date()): { ok: true; value: ComplimentaryInput } | { ok: false; error: string } {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const planCode = typeof input.planCode === 'string' ? input.planCode.trim() : '';
  if (!planCode) return { ok: false, error: 'Escolha o plano da cortesia.' };

  const reason = typeof input.reason === 'string' ? input.reason.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < 3) return { ok: false, error: 'Escreva o motivo da cortesia (ex.: parceiro, permuta).' };
  if (reason.length > COMPLIMENTARY_REASON_MAX) return { ok: false, error: `O motivo pode ter até ${COMPLIMENTARY_REASON_MAX} caracteres.` };

  const rawUntil = typeof input.until === 'string' ? input.until.trim() : '';
  if (!rawUntil) return { ok: true, value: { planCode, until: null, reason } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) return { ok: false, error: 'Data de fim inválida.' };
  // Fim do dia no horário de Brasília (UTC-3).
  const until = Date.parse(`${rawUntil}T23:59:59-03:00`);
  // Recusa datas que não existem (ex.: 31 de fevereiro), que o JavaScript "empurra" para o mês seguinte.
  if (!Number.isFinite(until) || new Date(until - 3 * 60 * 60 * 1000).toISOString().slice(0, 10) !== rawUntil) {
    return { ok: false, error: 'Data de fim inválida.' };
  }
  if (until <= now.getTime()) return { ok: false, error: 'A data de fim precisa ser hoje ou depois.' };
  if (until - now.getTime() > MAX_DAYS * DAY_MS) return { ok: false, error: 'O prazo máximo é de 5 anos. Para sem prazo, deixe a data em branco.' };
  return { ok: true, value: { planCode, until: new Date(until).toISOString(), reason } };
}

/**
 * Situação ao revogar a cortesia: com assinatura ativa, segue ativa; com teste ainda valendo, volta
 * ao teste; sem nada, o teste fica encerrado agora e a empresa vê a tela de assinatura.
 */
export function statusAfterComplimentaryRevoked(
  input: { trialEndsAt: string | null; hasActiveSubscription: boolean },
  now: Date = new Date(),
): { status: 'active' | 'trial'; trialEndsAt: string | null } {
  if (input.hasActiveSubscription) return { status: 'active', trialEndsAt: input.trialEndsAt };
  const trialEnds = time(input.trialEndsAt);
  if (trialEnds !== null && trialEnds > now.getTime()) return { status: 'trial', trialEndsAt: input.trialEndsAt };
  return { status: 'trial', trialEndsAt: now.toISOString() };
}

/** Colunas da cortesia, para os selects de organizations. */
export const COMPLIMENTARY_COLUMNS = 'complimentary_since,complimentary_until,complimentary_reason,complimentary_by';

export type PlanChangeAction = 'plan_changed' | 'complimentary_granted' | 'complimentary_updated' | 'complimentary_revoked';

/** Campos gravados na empresa ao liberar (ou alterar) a cortesia. */
export function grantComplimentaryPatch(
  input: ComplimentaryInput,
  current: ComplimentaryOrganization,
  actorUserId: string,
  now: Date = new Date(),
) {
  return {
    status: 'active' as const,
    plan_code: input.planCode,
    // Alterar uma cortesia que já vale mantém a data de início original.
    complimentary_since: isComplimentaryActive(current, now) && current.complimentary_since ? current.complimentary_since : now.toISOString(),
    complimentary_until: input.until,
    complimentary_reason: input.reason,
    complimentary_by: actorUserId,
  };
}

/** Campos gravados ao revogar: limpa a cortesia e devolve a empresa ao fluxo normal. */
export function revokeComplimentaryPatch(input: { trialEndsAt: string | null; hasActiveSubscription: boolean }, now: Date = new Date()) {
  const next = statusAfterComplimentaryRevoked(input, now);
  return {
    status: next.status,
    trial_ends_at: next.trialEndsAt,
    complimentary_since: null,
    complimentary_until: null,
    complimentary_reason: null,
    complimentary_by: null,
  };
}

/** Assinatura que ainda cobra na Pagar.me: com ela, a cortesia não pode ser liberada (cobraria em dobro). */
export const isChargingSubscription = (status: string | null | undefined): boolean => status === 'active' || status === 'past_due';

// ---------- Selo do plano no menu do workspace ----------

const PLAN_SHORT_NAME: Record<string, string> = { tendi_start: 'Start', tendi_pro: 'Pro' };

export type PlanBadge = { label: string; tone: 'pro' | 'start' };

/**
 * Selo ao lado da logo: "Pro", "Start", "Pro · teste", "Pro · cortesia".
 * null quando a empresa não tem um plano conhecido.
 */
export function planBadge(
  org: { plan_code?: string | null; status?: string | null } & ComplimentaryOrganization | null | undefined,
  now: Date = new Date(),
): PlanBadge | null {
  const name = org?.plan_code ? PLAN_SHORT_NAME[org.plan_code] : undefined;
  if (!name) return null;
  const suffix = isComplimentaryActive(org, now) ? ' · cortesia' : org?.status === 'trial' ? ' · teste' : '';
  return { label: `${name}${suffix}`, tone: org?.plan_code === 'tendi_pro' ? 'pro' : 'start' };
}
