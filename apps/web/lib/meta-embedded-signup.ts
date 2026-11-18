/**
 * Cadastro incorporado da Meta (Embedded Signup v4): o cliente conecta o
 * próprio número oficial do WhatsApp sem sair do TendiDesk.
 *
 * O navegador abre a janela da Meta (FB.login com o config_id do app), que
 * devolve um código (vale 5 minutos, uso único) e, por mensagem da janela,
 * a conta (WABA) e o número escolhidos. O servidor repassa tudo ao On Connect,
 * que troca o código pelo token do cliente e liga o número à sessão do
 * workspace. O código nunca é guardado nem registrado em log.
 *
 * Funções puras (sem segredo), usadas no navegador.
 */

/** Versão da Graph API usada pelo SDK de JavaScript da Meta. */
export const META_SDK_VERSION = 'v27.0';

export type SignupResult =
  | { kind: 'finish'; wabaId: string; phoneNumberId: string }
  | { kind: 'cancel'; step: string | null }
  | { kind: 'error'; message: string };

/** Opções do FB.login para o cadastro incorporado do WhatsApp. */
export function signupLoginOptions(configId: string) {
  return {
    config_id: configId,
    response_type: 'code',
    override_default_response_type: true,
    extras: { setup: {} },
  } as const;
}

const ID = /^[0-9]{5,30}$/;

/**
 * Lê a mensagem que a janela da Meta manda ao terminar. Só aceita mensagens
 * vindas de https://*.facebook.com; qualquer outra coisa é ignorada (null).
 */
export function parseSignupMessage(origin: string, data: unknown): SignupResult | null {
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return null;
    host = url.hostname;
  } catch {
    return null;
  }
  if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return null;

  let payload: unknown = data;
  if (typeof data === 'string') {
    try { payload = JSON.parse(data); } catch { return null; }
  }
  if (!payload || typeof payload !== 'object') return null;
  const message = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (message.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const details = message.data ?? {};

  if (message.event === 'FINISH') {
    const wabaId = String(details.waba_id ?? '');
    const phoneNumberId = String(details.phone_number_id ?? '');
    if (!ID.test(wabaId) || !ID.test(phoneNumberId)) {
      return { kind: 'error', message: 'A Meta não informou a conta ou o número escolhido.' };
    }
    return { kind: 'finish', wabaId, phoneNumberId };
  }
  if (message.event === 'CANCEL') {
    return { kind: 'cancel', step: typeof details.current_step === 'string' ? details.current_step : null };
  }
  if (message.event === 'ERROR') {
    return { kind: 'error', message: typeof details.error_message === 'string' ? details.error_message : 'A Meta informou um erro no cadastro.' };
  }
  // FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (número que já usa o app WhatsApp Business) ainda não é suportado.
  if (typeof message.event === 'string' && message.event.startsWith('FINISH')) {
    return { kind: 'error', message: 'Este tipo de número (app WhatsApp Business) ainda não é suportado. Use um número sem WhatsApp instalado.' };
  }
  return null;
}

/** O que o servidor do TendiDesk precisa para concluir (validado lá também). */
export function signupRequestBody(code: string, finish: { wabaId: string; phoneNumberId: string }) {
  return { code, wabaId: finish.wabaId, phoneNumberId: finish.phoneNumberId };
}

export function isSignupBody(value: unknown): value is { code: string; wabaId: string; phoneNumberId: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.code === 'string' && body.code.length >= 10 && body.code.length <= 4096
    && typeof body.wabaId === 'string' && ID.test(body.wabaId)
    && typeof body.phoneNumberId === 'string' && ID.test(body.phoneNumberId);
}
