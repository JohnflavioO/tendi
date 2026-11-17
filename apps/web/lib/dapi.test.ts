import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCreateSessionPayload, buildDapiWebhookUrl, dapiRequest, getDapiBaseUrl } from './dapi';

const ON_CONNECT = 'https://onconnect.tendidesk.com.br/compat/dapi/api/v1';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('provider selection', () => {
  it('keeps D-API as the default when no override is set', () => {
    vi.stubEnv('DAPI_BASE_URL', undefined);
    expect(getDapiBaseUrl()).toBe('https://api.d-api.cloud/api/v1');
  });

  it('preserves the compatibility path and trims surrounding whitespace and trailing slashes', () => {
    vi.stubEnv('DAPI_BASE_URL', `  ${ON_CONNECT}///  `);
    expect(getDapiBaseUrl()).toBe(ON_CONNECT);
  });

  it.each([
    '', 'not-a-url', 'http://provider.example/api/v1',
    'https://user:secret@provider.example/api/v1',
    'https://provider.example/api/v1?key=secret',
    'https://provider.example/api/v1#secret',
  ])('rejects invalid configuration instead of silently using another provider (%s)', async (url) => {
    vi.stubEnv('DAPI_BASE_URL', url);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(dapiRequest('/sessions')).rejects.toThrow('DAPI_BASE_URL deve ser uma URL HTTPS');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not disclose a misconfigured credential in errors', () => {
    vi.stubEnv('DAPI_BASE_URL', 'https://user:do-not-log@provider.example');
    expect(() => getDapiBaseUrl()).toThrow(/^DAPI_BASE_URL deve ser uma URL HTTPS sem credenciais, query ou fragmento\.$/);
  });

  it('uses the configured provider with the existing server-only Authorization contract', async () => {
    vi.stubEnv('DAPI_BASE_URL', ON_CONNECT);
    vi.stubEnv('DAPI_API_KEY', 'test-on-connect-key');
    const payload = { success: true, data: { sessionId: 'tendi-workspace' } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const session = buildCreateSessionPayload('tendi-workspace', 'https://tendi.example/api/webhooks/dapi/test');
    expect(await dapiRequest('/sessions', { method: 'POST', body: JSON.stringify(session) })).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(`${ON_CONNECT}/sessions`, expect.objectContaining({
      method: 'POST', cache: 'no-store', body: JSON.stringify(session),
      headers: { Authorization: 'test-on-connect-key', 'Content-Type': 'application/json' },
    }));
  });

  it('does not fall back to D-API when On Connect refuses a credential', async () => {
    vi.stubEnv('DAPI_BASE_URL', ON_CONNECT);
    vi.stubEnv('DAPI_API_KEY', 'invalid-test-key');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(dapiRequest('/sessions/tendi-workspace')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the callback host independent from the provider and encodes its secret', () => {
    vi.stubEnv('DAPI_BASE_URL', ON_CONNECT);
    vi.stubEnv('DAPI_WEBHOOK_BASE_URL', 'https://tendi.example/');
    vi.stubEnv('DAPI_WEBHOOK_SECRET', 'test/secret+value');
    expect(buildDapiWebhookUrl()).toBe('https://tendi.example/api/webhooks/dapi/test%2Fsecret%2Bvalue');
  });
});
