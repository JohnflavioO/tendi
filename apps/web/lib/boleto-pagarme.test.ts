import { afterEach, describe, expect, it, vi } from 'vitest';
import { PagarmeError, createPagarmeProvider, friendlyPagarmeError, looksLikePagarmeKey, pagarmeEnvironment } from './boleto-pagarme';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

describe('chave do Pagar.me', () => {
  it('reconhece o formato sk_/sk_test_', () => {
    expect(looksLikePagarmeKey('sk_abcdefghij1234567890')).toBe(true);
    expect(looksLikePagarmeKey('sk_test_abcdefghij1234567890')).toBe(true);
    expect(looksLikePagarmeKey('$aact_123')).toBe(false);
  });
  it('ambiente sai do prefixo da chave', () => {
    expect(pagarmeEnvironment('sk_test_123')).toBe('sandbox');
    expect(pagarmeEnvironment('sk_123')).toBe('production');
  });
});

describe('Pagar.me (graph api v5)', () => {
  it('verifica a chave com HTTP Basic', async () => {
    const fetchFn = vi.fn().mockReturnValue(jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchFn);
    const provider = createPagarmeProvider(fetchFn);
    const account = await provider.verify('sk_123');
    expect(account).toEqual({ environment: 'production', accountLabel: null });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('https://api.pagar.me/core/v5/customers?page=1&size=1');
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('sk_123:').toString('base64')}`);
  });

  it('busca o cliente pelo documento e lista as cobranças de boleto em aberto', async () => {
    const fetchFn: any = vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('/customers?document=')) return jsonResponse({ data: [{ id: 'cus_1' }] });
      if (href.includes('/charges?customer_id=cus_1')) return jsonResponse({
        data: [
          { id: 'ch_1', status: 'pending', amount: 18900, due_at: '2026-11-20T00:00:00Z', code: 'PED-1', last_transaction: { line: '237933812...', pdf: 'https://pagar.me/pdf/1', url: 'https://pagar.me/i/1' } },
          { id: 'ch_2', status: 'paid', amount: 5000, due_at: '2026-10-01T00:00:00Z' },
        ],
      });
      return jsonResponse({ error: { message: 'inesperado' } }, false);
    });
    vi.stubGlobal('fetch', fetchFn);
    const provider = createPagarmeProvider(fetchFn);
    const boletos = await provider.findOpenBoletos('sk_123', '12345678909');
    expect(boletos).toEqual([{
      id: 'ch_1', amount: 189, dueDate: '2026-11-20', overdue: false, description: 'PED-1',
      digitableLine: '237933812...', pdfUrl: 'https://pagar.me/pdf/1', invoiceUrl: 'https://pagar.me/i/1',
    }]);
  });

  it('propaga o erro com uma mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({}, false, 401)));
    const provider = createPagarmeProvider();
    const failure = await provider.verify('sk_ruim').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PagarmeError);
    expect(friendlyPagarmeError(failure)).toContain('recusou a chave');
  });
});
