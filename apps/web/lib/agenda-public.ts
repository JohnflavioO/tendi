/**
 * Agendamento público: regras puras (sem rede e sem banco), usadas pela tela de configuração
 * (cliente) e pelas rotas /api/agenda-public/* (servidor). Mesma separação de agenda-reminders.ts.
 */

export type PublicBookingSettings = { enabled: boolean; windowDays: number; minNoticeMinutes: number };

export const DEFAULT_PUBLIC_BOOKING_SETTINGS: PublicBookingSettings = { enabled: false, windowDays: 14, minNoticeMinutes: 60 };

export const PUBLIC_BOOKING_WINDOW_OPTIONS = [7, 14, 21, 30] as const;
export const PUBLIC_BOOKING_NOTICE_OPTIONS = [0, 30, 60, 120, 240] as const;

/** Lê organizations.agenda_settings.publicBooking; qualquer valor inválido cai no padrão (desligado). */
export function normalizePublicBookingSettings(raw: unknown): PublicBookingSettings {
  const root = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>).publicBooking : null;
  const value = root && typeof root === 'object' && !Array.isArray(root) ? (root as Record<string, unknown>) : {};
  const windowDays = Number(value.windowDays);
  const minNotice = Number(value.minNoticeMinutes);
  return {
    enabled: value.enabled === true,
    windowDays: Number.isFinite(windowDays) && windowDays >= 1 && windowDays <= 60 ? Math.round(windowDays) : DEFAULT_PUBLIC_BOOKING_SETTINGS.windowDays,
    minNoticeMinutes: Number.isFinite(minNotice) && minNotice >= 0 && minNotice <= 1440 ? Math.round(minNotice) : DEFAULT_PUBLIC_BOOKING_SETTINGS.minNoticeMinutes,
  };
}
