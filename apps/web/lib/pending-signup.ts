// E-mail do cadastro que ainda aguarda confirmação. Fica só na sessão do
// navegador (sessionStorage), nunca na URL, para a tela de confirmação poder
// mostrar o endereço e reenviar o link.

const KEY = 'tendi:pending-signup-email';

export function rememberPendingSignupEmail(email: string): void {
  try { window.sessionStorage.setItem(KEY, email); } catch { /* armazenamento indisponível */ }
}

export function readPendingSignupEmail(): string {
  try { return window.sessionStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
