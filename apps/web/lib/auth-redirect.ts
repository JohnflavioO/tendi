/**
 * Destinos permitidos depois de um link de e-mail (login, redefinição de senha, convite).
 * Só caminhos internos: impede usar o link do TendiDesk para mandar a pessoa a outro site.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  const next = value.trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return null;
  try {
    const url = new URL(next, 'https://tendi.local');
    return url.origin === 'https://tendi.local' ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export const RESET_PASSWORD_PATH = '/definir-senha?modo=redefinir';

/** Tipos de link aceitos em /auth/confirm (token_hash do Supabase). */
export const OTP_TYPES = ['recovery', 'invite', 'magiclink', 'signup', 'email', 'email_change'] as const;
export type OtpType = (typeof OTP_TYPES)[number];
export const isOtpType = (value: unknown): value is OtpType => typeof value === 'string' && (OTP_TYPES as readonly string[]).includes(value);

/** Para onde levar a pessoa depois que o link foi validado. */
export function destinationAfterLink(input: { type: OtpType | null; needsPassword: boolean; next: string | null }): string {
  if (input.type === 'recovery') return RESET_PASSWORD_PATH;
  if (input.needsPassword) return '/definir-senha';
  return input.next ?? '/inbox';
}
