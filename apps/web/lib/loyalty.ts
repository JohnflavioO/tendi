/**
 * Fidelidade por pontos: regras puras (sem rede e sem banco). O crédito dos pontos em si
 * acontece num gatilho do banco (supabase/migrations/..._agendar_loyalty_points.sql) quando um
 * agendamento é marcado como "Atendido" — este arquivo só normaliza a configuração da empresa,
 * usada pela tela de Configurar.
 */

export type LoyaltySettings = { enabled: boolean; pointsPerVisit: number };

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = { enabled: false, pointsPerVisit: 10 };

export const LOYALTY_POINTS_OPTIONS = [5, 10, 20, 50, 100] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Lê organizations.agenda_settings.loyalty; qualquer valor inválido cai no padrão (desligado). */
export function normalizeLoyaltySettings(agendaSettings: unknown): LoyaltySettings {
  const raw = isRecord(agendaSettings) && isRecord(agendaSettings.loyalty) ? agendaSettings.loyalty : {};
  const points = Number(raw.pointsPerVisit);
  return {
    enabled: raw.enabled === true,
    pointsPerVisit: (LOYALTY_POINTS_OPTIONS as readonly number[]).includes(points) ? points : DEFAULT_LOYALTY_SETTINGS.pointsPerVisit,
  };
}
