import type { BoletoProvider, OpenBoleto, ProviderAccount } from './boleto';

/**
 * Pagar.me / Stone, API v5 (https://docs.pagar.me). Autenticação HTTP Basic com a chave secreta
 * como usuário e senha em branco. A chave de produção começa com "sk_" e a de teste com
 * "sk_test_"; usamos só leitura: clientes, cobranças e a transação (linha digitável do boleto).
 *
 * Observação: o campo exato da linha digitável dentro de `last_transaction` não está 100%
 * documentado publicamente; tentamos os nomes mais comuns (`line`, `digitable_line`,
 * `digitableLine`) e seguimos sem ela (só com o link do PDF) se nenhum bater.
 */

type FetchFn = typeof fetch;
const BASE_URL = 'https://api.pagar.me/core/v5';
const OPEN_STATUSES = new Set(['pending', 'processing']);
const MAX_CUSTOMERS = 5;

export function pagarmeEnvironment(apiKey: string): ProviderAccount['environment'] {
  return /^sk_test_/.test(apiKey.trim()) ? 'sandbox' : 'production';
}

export function looksLikePagarmeKey(apiKey: string): boolean {
  return /^sk_(test_)?[A-Za-z0-9]{10,}$/.test(apiKey.trim());
}

export class PagarmeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Mensagem curta para a tela de Integrações. */
export function friendlyPagarmeError(error: unknown): string {
  if (error instanceof PagarmeError) {
    if (error.status === 401) return 'O Pagar.me recusou a chave. Confira se copiou a chave secreta inteira (começa com sk_).';
    if (error.status === 403) return 'A chave do Pagar.me não tem permissão para ler clientes e cobranças.';
    if (error.status === 429) return 'O Pagar.me pediu uma pausa nas consultas. Tente de novo em alguns minutos.';
    return `O Pagar.me respondeu com erro (${error.status}).`;
  }
  if (error instanceof Error && /timeout|abort/i.test(error.name + error.message)) return 'O Pagar.me demorou para responder. Tente de novo.';
  return 'Não foi possível falar com o Pagar.me agora.';
}

function pickString(source: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function createPagarmeProvider(fetchFn: FetchFn = fetch): BoletoProvider {
  async function get<T>(apiKey: string, path: string): Promise<T> {
    const response = await fetchFn(`${BASE_URL}${path}`, {
      headers: { authorization: `Basic ${Buffer.from(`${apiKey.trim()}:`).toString('base64')}`, 'content-type': 'application/json', 'user-agent': 'TendiDesk' },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new PagarmeError(`Pagar.me HTTP ${response.status}`, response.status);
    return (await response.json()) as T;
  }

  return {
    id: 'pagarme',
    label: 'Pagar.me (Stone)',

    async verify(apiKey) {
      await get(apiKey, '/customers?page=1&size=1');
      return { environment: pagarmeEnvironment(apiKey), accountLabel: null };
    },

    async findOpenBoletos(apiKey, document) {
      const customers = await get<{ data?: Array<{ id: string }> }>(apiKey, `/customers?document=${encodeURIComponent(document)}&page=1&size=${MAX_CUSTOMERS}`);
      const ids = (customers.data ?? []).filter(customer => typeof customer.id === 'string').map(customer => customer.id);
      const boletos: OpenBoleto[] = [];
      for (const customerId of ids) {
        const charges = await get<{ data?: any[] }>(apiKey, `/charges?customer_id=${encodeURIComponent(customerId)}&payment_method=boleto&page=1&size=20`);
        for (const charge of charges.data ?? []) {
          if (!OPEN_STATUSES.has(charge?.status) || typeof charge.id !== 'string') continue;
          const dueDate = typeof charge.due_at === 'string' ? charge.due_at.slice(0, 10) : null;
          if (!dueDate) continue;
          const transaction = (charge.last_transaction ?? {}) as Record<string, unknown>;
          boletos.push({
            id: charge.id,
            amount: Number(charge.amount ?? 0) / 100,
            dueDate,
            overdue: dueDate < new Date().toISOString().slice(0, 10),
            description: typeof charge.code === 'string' && charge.code.trim() ? charge.code.trim() : null,
            digitableLine: pickString(transaction, ['line', 'digitable_line', 'digitableLine']),
            pdfUrl: pickString(transaction, ['pdf', 'pdf_url', 'pdfUrl']),
            invoiceUrl: pickString(transaction, ['url', 'invoiceUrl', 'bank_slip_url']),
          });
        }
      }
      return boletos;
    },
  };
}
