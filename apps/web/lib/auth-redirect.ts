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

/** Métodos de login gravados no token de acesso (claim "amr" do Supabase). */
function loginMethods(accessToken: string | null | undefined): string[] {
  const payload = accessToken?.split('.')[1];
  if (!payload) return [];
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return Array.isArray(json?.amr) ? json.amr.map((item: any) => String(item?.method ?? item)) : [];
  } catch {
    return [];
  }
}

/**
 * Login feito pelo link "Esqueci minha senha". Vale mesmo quando o Supabase descarta o destino pedido
 * (endereço fora da lista de redirecionamentos) e o código chega sem o "next".
 * Sinais: método "recovery" no token ou pedido de recuperação feito há menos de 1 hora.
 */
export function isRecoveryLogin(input: { accessToken?: string | null; recoverySentAt?: string | null; now?: Date }): boolean {
  if (loginMethods(input.accessToken).includes('recovery')) return true;
  const sentAt = input.recoverySentAt ? Date.parse(input.recoverySentAt) : NaN;
  const age = (input.now ?? new Date()).getTime() - sentAt;
  return Number.isFinite(age) && age >= 0 && age <= 60 * 60 * 1000;
}

/** Para onde levar a pessoa depois que o link foi validado. */
export function destinationAfterLink(input: { type: OtpType | null; needsPassword: boolean; next: string | null }): string {
  if (input.type === 'recovery') return RESET_PASSWORD_PATH;
  if (input.needsPassword) return '/definir-senha';
  return input.next ?? '/inbox';
}
