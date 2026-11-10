const DAPI_BASE_URL = 'https://api.d-api.cloud/api/v1';

export const DAPI_EVENTS = [
  'messages.received',
  'messages.sent',
  'message.read',
  'message.delivered',
  'message.update',
  'message.deleted',
  'contacts.upsert',
  'contacts.update',
  'chats.upsert',
  'chats.update',
  'groups_participants.join',
  'groups_participants.leave',
  'groups_participants.promote',
  'groups_participants.demote',
  'presence',
  'logged_out',
  'connection.qrcode',
  'connection.status',
] as const;

export class DapiError extends Error {
  status: number;
  code?: string | number;
  traceId?: string;

  constructor(message: string, status: number, code?: string | number, traceId?: string) {
    super(message);
    this.name = 'DapiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

export type DapiSession = {
  sessionId?: string;
  status?: string;
  phone?: string;
  phoneNumber?: string;
  [key: string]: unknown;
};

export function getDapiApiKey(): string {
  const key = process.env.DAPI_API_KEY?.trim();
  if (!key) {
    throw new Error('DAPI_API_KEY não está configurada no servidor.');
  }
  return key;
}

export function getDapiWebhookSecret(): string {
  const secret = process.env.DAPI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('DAPI_WEBHOOK_SECRET não está configurado no servidor.');
  }
  return secret;
}

export function buildDapiWebhookUrl(): string {
  const baseUrl = process.env.DAPI_WEBHOOK_BASE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('DAPI_WEBHOOK_BASE_URL não está configurada no servidor.');
  const secret = encodeURIComponent(getDapiWebhookSecret());
  return `${baseUrl}/api/webhooks/dapi/${secret}`;
}

export function buildCreateSessionPayload(sessionId: string, webhookUrl: string) {
  const events = Object.fromEntries(
    DAPI_EVENTS.map((event) => [event, { enabled: true, webhookUrl }]),
  );

  return {
    sessionId,
    connectionMode: 'qr',
    webhookUrl,
    webhookConfig: {
      enabled: true,
      type: 'single',
      events,
    },
    ignoreGroups: true,
    ignoreStatus: true,
    historySync: true,
  };
}

export async function dapiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { onResponse?: (status: number, payload: unknown) => void } = {},
): Promise<T> {
  const response = await fetch(`${DAPI_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(20_000),
    headers: {
      Authorization: getDapiApiKey(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  options.onResponse?.(response.status, payload);
  const body = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  // D-API errors can arrive as an application-level { error, sessionId, code }
  // envelope even when the HTTP transport itself responds 200. Never treat
  // that envelope as a successful QR/session resource.
  const hasApiError = typeof body.error === 'string' && body.error.trim().length > 0;
  if (!response.ok || body.success === false || hasApiError) {
    const message = hasApiError
      ? (body.error as string).trim()
      : `A D-API não conseguiu concluir a operação (HTTP ${response.status}).`;
    const reportedStatus = typeof body.statusCode === 'number' &&
      Number.isInteger(body.statusCode) && body.statusCode >= 400 && body.statusCode <= 599
      ? body.statusCode
      : undefined;
    const effectiveStatus = !response.ok ? response.status : (reportedStatus ?? 502);
    const code = typeof body.code === 'string' || typeof body.code === 'number' ? body.code : undefined;
    const traceId = typeof body.traceId === 'string' ? body.traceId : undefined;
    throw new DapiError(message, effectiveStatus, code, traceId);
  }

  return payload as T;
}

export function normalizeDapiStatus(
  status: unknown,
): 'connected' | 'pending' | 'disconnected' | 'error' {
  const value = typeof status === 'string' ? status.toLowerCase() : '';
  if (['connected', 'open', 'ready', 'authenticated'].includes(value)) return 'connected';
  if (['disconnected', 'closed', 'logged_out'].includes(value)) return 'disconnected';
  if (['error', 'failed'].includes(value)) return 'error';
  return 'pending';
}


/** D-API endpoints may return the resource directly or inside a data/session envelope. */
export function unwrapDapiResource(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const root = payload as Record<string, unknown>;
  const candidate = root.data ?? root.session ?? root.result;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return root;
}

export function extractDapiConnectionStatus(payload: unknown): string | undefined {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const resource = unwrapDapiResource(payload);
  const connection = resource.connection && typeof resource.connection === 'object'
    ? resource.connection as Record<string, unknown>
    : {};
  const value = resource.status ?? resource.connectionStatus ?? resource.state ??
    connection.status ?? root.status;
  return typeof value === 'string' ? value : undefined;
}
