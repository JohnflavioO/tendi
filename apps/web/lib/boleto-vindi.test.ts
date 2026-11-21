import { afterEach, describe, expect, it, vi } from 'vitest';
import { VindiError, createVindiProvider, friendlyVindiError, looksLikeVindiKey } from './boleto-vindi';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

describe('chave da Vindi', () => {
  it('aceita uma chave razoavelmente longa', () => {
    expect(looksLikeVindiKey('abcdefghij1234567890')).toBe(true);
    expect(looksLikeVindiKey('curta')).toBe(false);
  });
});

describe('Vindi (api v1)', () => {
  it('verifica a chave com HTTP Basic e lê o nome da conta', async () => {
    const fetchFn = vi.fn().mockReturnValue(jsonResponse({ merchant: { company_name: 'Minha Loja' } }));
    vi.stubGlobal('fetch', fetchFn);
    const provider = createVindiProvider(fetchFn);
    const account = await provider.verify('chave-123');
    expect(account).toEqual({ environment: 'production', accountLabel: 'Minha Loja' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('https://app.vindi.com.br/api/v1/merchants/current');
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('chave-123:').toString('base64')}`);
  });

  it('busca o cliente pelo registry_code e lista as cobranças pendentes', async () => {
    const fetchFn: any = vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('/customers?query=')) return jsonResponse({ customers: [{ id: 42 }] });
      if (href.includes('/charges?query=') && href.includes('customer_id%3D42')) return jsonResponse({
        charges: [
          { id: 99, status: 'pending', amount: '189.00', due_at: '2099-11-20', bill_id: 7, print_url: 'https://vindi.com/boletos/99', last_transaction: { gateway_response_fields: { typeable_barcode: '237933812...' } } },
          { id: 100, status: 'paid', amount: '50.00', due_at: '2026-10-01' },
        ],
      });
      return jsonResponse({ error: { message: 'inesperado' } }, false);
    });
    vi.stubGlobal('fetch', fetchFn);
    const provider = createVindiProvider(fetchFn);
    const boletos = await provider.findOpenBoletos('chave-123', '12345678909');
    expect(boletos).toEqual([{
      id: '99', amount: 189, dueDate: '2099-11-20', overdue: false, description: 'Fatura 7',
      digitableLine: '237933812...', pdfUrl: 'https://vindi.com/boletos/99', invoiceUrl: null,
    }]);
  });

  it('propaga o erro com uma mensagem amigável', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({}, false, 401)));
    const provider = createVindiProvider();
    const failure = await provider.verify('chave-ruim').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(VindiError);
    expect(friendlyVindiError(failure)).toContain('recusou a chave');
  });
});
