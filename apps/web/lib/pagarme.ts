/**
 * Cliente mínimo da API v5 da Pagar.me (só no servidor).
 * Autenticação: HTTP Basic com a chave secreta como usuário e senha vazia.
 * Chaves de teste (sk_test_...) usam o ambiente de testes (sandbox).
 */

export type PagarmeRequest = <T = any>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }) => Promise<T>;

export class PagarmeError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = 'PagarmeError';
  }
}

export const isTestKey = (key: string) => key.startsWith('sk_test_');

export function pagarmeBaseUrl(key: string): string {
  return isTestKey(key) ? 'https://sdx-api.pagar.me/core/v5' : 'https://api.pagar.me/core/v5';
}

/** Validação leve do formato da chave secreta (pega colagem errada da chave pública). */
export function validateSecretKey(key: string): string | null {
  const value = key.trim();
  if (!value) return 'Cole a chave secreta.';
  if (value.startsWith('pk_')) return 'Esta é a chave pública. Use a chave secreta, que começa com "sk_".';
  if (!value.startsWith('sk_')) return 'A chave secreta da Pagar.me começa com "sk_".';
  if (/\s/.test(value) || value.length < 16 || value.length > 200) return 'A chave parece incompleta. Copie novamente da Dashboard da Pagar.me.';
  return null;
}

function describeError(payload: any, status: number): string {
  const message = typeof payload?.message === 'string' ? payload.message : '';
  const errors = payload?.errors && typeof payload.errors === 'object'
    ? Object.entries(payload.errors as Record<string, unknown>).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ')
    : '';
  if (status === 401) return 'A Pagar.me recusou a chave secreta (inválida ou de outro ambiente).';
  return [message, errors].filter(Boolean).join(' · ') || `Erro HTTP ${status} da Pagar.me.`;
}

export function createPagarmeClient(secretKey: string, fetchImpl: typeof fetch = fetch): PagarmeRequest {
  const base = pagarmeBaseUrl(secretKey);
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
  return async (path, init = {}) => {
    const response = await fetchImpl(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization, accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new PagarmeError(describeError(payload, response.status), response.status, payload);
    return payload;
  };
}

export const toCents = (reais: number) => Math.round(reais * 100);
