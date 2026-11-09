const DAPI_BASE_URL = 'https://api.d-api.cloud/api/v1';

export type DapiSession = {
  sessionId?: string;
  status?: string;
  phone?: string;
  phoneNumber?: string;
  [key: string]: unknown;
};

function apiKey() {
  const key = process.env.DAPI_API_KEY;
  if (!key) throw new Error('DAPI_API_KEY não está configurada no servidor.');
  return key;
}

export async function dapiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${DAPI_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: apiKey(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = typeof payload?.error === 'string' ? payload.error : 'A D-API não conseguiu concluir a operação.';
    throw new Error(message);
  }
  return payload as T;
}

export function normalizeDapiStatus(status: unknown): 'connected' | 'pending' | 'disconnected' | 'error' {
  const value = typeof status === 'string' ? status.toLowerCase() : '';
  if (['connected', 'open', 'ready', 'authenticated'].includes(value)) return 'connected';
  if (['disconnected', 'closed', 'logged_out'].includes(value)) return 'disconnected';
  if (['error', 'failed'].includes(value)) return 'error';
  return 'pending';
}
