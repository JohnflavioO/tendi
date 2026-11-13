/**
 * Acesso de suporte: regras de exibição dos registros (funções puras).
 * O banco é quem decide o acesso de verdade (private.has_support_access).
 */

export type SupportGrant = {
  id: string;
  organization_id: string;
  access_hours: number;
  reason: string | null;
  created_at: string;
  code_expires_at: string;
  redeemed_at: string | null;
  access_expires_at: string | null;
  ended_at: string | null;
};

export const SUPPORT_GRANT_COLUMNS = 'id,organization_id,access_hours,reason,created_at,code_expires_at,redeemed_at,access_expires_at,ended_at';
export const SUPPORT_HOUR_OPTIONS = [1, 2, 4, 8, 24] as const;
export const SUPPORT_CODE_LENGTH = 8;

export type SupportGrantState = 'waiting' | 'active' | 'code_expired' | 'finished' | 'cancelled';

/**
 * Situação de um registro:
 * - waiting: código gerado, ainda dentro dos 15 minutos, aguardando o suporte usar.
 * - active: o suporte usou o código e o acesso está valendo.
 * - code_expired: ninguém usou o código a tempo.
 * - cancelled: código cancelado antes de ser usado.
 * - finished: houve acesso e ele acabou (prazo ou encerramento).
 */
export function supportGrantState(grant: SupportGrant, now: Date = new Date()): SupportGrantState {
  const at = now.getTime();
  if (!grant.redeemed_at) {
    if (grant.ended_at) return 'cancelled';
    return Date.parse(grant.code_expires_at) > at ? 'waiting' : 'code_expired';
  }
  if (grant.ended_at) return 'finished';
  return grant.access_expires_at && Date.parse(grant.access_expires_at) > at ? 'active' : 'finished';
}

export const SUPPORT_STATE_LABEL: Record<SupportGrantState, string> = {
  waiting: 'Aguardando o suporte',
  active: 'Acesso em andamento',
  code_expired: 'Código não utilizado',
  cancelled: 'Código cancelado',
  finished: 'Acesso encerrado',
};

/** "48392107" -> "4839 2107" (mais fácil de ditar por telefone). */
export function formatSupportCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  return digits.length === SUPPORT_CODE_LENGTH ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

/** Só os dígitos do que foi digitado, no máximo 8. */
export function cleanSupportCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, SUPPORT_CODE_LENGTH);
}

export const hoursLabel = (hours: number): string => (hours === 1 ? '1 hora' : `${hours} horas`);
