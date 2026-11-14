/**
 * Webchat: validação e textos do widget embutido no site do cliente. Funções puras
 * (sem rede e sem banco), usadas pela tela de configuração e pelas rotas públicas.
 */

export const MAX_WEBCHAT_MESSAGE_LENGTH = 2000;
export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_GREETING_LENGTH = 300;
export const WEBCHAT_SESSION_DAYS = 30;

/** Chave pública do widget: 32 caracteres hexadecimais (16 bytes aleatórios). */
export function isValidWebchatPublicKey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value);
}

export function isValidWebchatColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export type WebchatMessageCheck = { ok: true; text: string } | { ok: false; error: string };

/** Mensagem do visitante: só texto nesta etapa (o atendente pode enviar arquivos; o visitante, não). */
export function checkWebchatMessage(raw: unknown): WebchatMessageCheck {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, error: 'Escreva uma mensagem antes de enviar.' };
  if (text.length > MAX_WEBCHAT_MESSAGE_LENGTH) return { ok: false, error: `A mensagem passa do limite de ${MAX_WEBCHAT_MESSAGE_LENGTH} caracteres.` };
  return { ok: true, text };
}

export function checkDisplayName(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Informe um nome para o widget.';
  if (value.length > MAX_DISPLAY_NAME_LENGTH) return `O nome passa do limite de ${MAX_DISPLAY_NAME_LENGTH} caracteres.`;
  return null;
}

export function checkGreeting(raw: string): string | null {
  if (raw.length > MAX_GREETING_LENGTH) return `A mensagem de saudação passa do limite de ${MAX_GREETING_LENGTH} caracteres.`;
  return null;
}

/** Trecho de código para o cliente colar no site dele. */
export function buildWebchatEmbedSnippet(publicKey: string, origin: string): string {
  return `<script src="${origin}/webchat.js" data-tendi-key="${publicKey}" async></script>`;
}

/** No máximo uma mensagem a cada ~3 s por visitante, para não virar uma porta de spam. */
export const WEBCHAT_RATE_LIMIT = { windowSeconds: 60, maxMessages: 20 };

export function tooManyWebchatMessages(recentCount: number): boolean {
  return recentCount >= WEBCHAT_RATE_LIMIT.maxMessages;
}

/**
 * O widget roda no site do cliente, numa origem diferente da do TendiDesk: sem isto, o navegador
 * bloqueia as chamadas por CORS antes mesmo de chegarem ao servidor. Liberado para qualquer
 * origem de propósito (não usa cookies; quem autoriza é o token da sessão, dentro do corpo/consulta).
 */
export const WEBCHAT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
