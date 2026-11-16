import type { BoletoProvider, OpenBoleto, ProviderAccount } from './boleto';

/**
 * Vindi (https://developers.vindi.com.br), API v1. Autenticação HTTP Basic com a chave de API
 * como usuário e senha em branco. Usa só leitura: clientes (busca pelo registry_code, que é o
 * CPF/CNPJ) e cobranças (charges) do cliente encontrado.
 *
 * Observação: o sandbox da Vindi é uma CONTA separada, com chave própria, sem jeito de saber pela
 * chave se é produção ou teste — por isso sempre falamos com a URL de produção aqui. O nome exato
 * do campo da linha digitável na resposta não está documentado publicamente; tentamos os nomes
 * mais comuns e seguimos sem ela (só com o link do boleto) se nenhum bater.
 */

type FetchFn = typeof fetch;
const BASE_URL = 'https://app.vindi.com.br/api/v1';
const OPEN_STATUSES = new Set(['pending']);
const MAX_CUSTOMERS = 5;

export function looksLikeVindiKey(apiKey: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(apiKey.trim());
}

export class VindiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Mensagem curta para a tela de Integrações. */
export function friendlyVindiError(error: unknown): string {
  if (error instanceof VindiError) {
    if (error.status === 401) return 'A Vindi recusou a chave. Confira se copiou a chave de API inteira.';
    if (error.status === 403) return 'A chave da Vindi não tem permissão para ler clientes e cobranças.';
    if (error.status === 429) return 'A Vindi pediu uma pausa nas consultas. Tente de novo em alguns minutos.';
    return `A Vindi respondeu com erro (${error.status}).`;
  }
  if (error instanceof Error && /timeout|abort/i.test(error.name + error.message)) return 'A Vindi demorou para responder. Tente de novo.';
  return 'Não foi possível falar com a Vindi agora.';
}

function pickString(source: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function createVindiProvider(fetchFn: FetchFn = fetch): BoletoProvider {
  async function get<T>(apiKey: string, path: string): Promise<T> {
    const response = await fetchFn(`${BASE_URL}${path}`, {
      headers: { authorization: `Basic ${Buffer.from(`${apiKey.trim()}:`).toString('base64')}`, 'content-type': 'application/json', 'user-agent': 'TendiDesk' },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new VindiError(`Vindi HTTP ${response.status}`, response.status);
    return (await response.json()) as T;
  }

  return {
    id: 'vindi',
    label: 'Vindi',

    async verify(apiKey) {
      const merchant = await get<{ merchant?: { company_name?: string; name?: string } }>(apiKey, '/merchants/current');
      const accountLabel = (merchant.merchant?.company_name || merchant.merchant?.name || '').trim().slice(0, 120) || null;
      return { environment: 'production' as ProviderAccount['environment'], accountLabel };
    },

    async findOpenBoletos(apiKey, document) {
      const customers = await get<{ customers?: Array<{ id: number }> }>(apiKey, `/customers?query=${encodeURIComponent(`registry_code=${document}`)}&per_page=${MAX_CUSTOMERS}`);
      const ids = (customers.customers ?? []).filter(customer => typeof customer.id === 'number').map(customer => customer.id);
      const boletos: OpenBoleto[] = [];
      for (const customerId of ids) {
        const charges = await get<{ charges?: any[] }>(apiKey, `/charges?query=${encodeURIComponent(`customer_id=${customerId}`)}&per_page=20`);
        for (const charge of charges.charges ?? []) {
          if (!OPEN_STATUSES.has(charge?.status) || typeof charge.id !== 'number') continue;
          const dueDate = typeof charge.due_at === 'string' ? charge.due_at.slice(0, 10) : null;
          if (!dueDate) continue;
          const gatewayFields = (charge.last_transaction?.gateway_response_fields ?? {}) as Record<string, unknown>;
          boletos.push({
            id: String(charge.id),
            amount: Number(charge.amount ?? 0),
            dueDate,
            overdue: dueDate < new Date().toISOString().slice(0, 10),
            description: typeof charge.bill_id === 'number' ? `Fatura ${charge.bill_id}` : null,
            digitableLine: pickString(gatewayFields, ['typeable_barcode', 'digitable_line', 'line']),
            pdfUrl: typeof charge.print_url === 'string' && charge.print_url.trim() ? charge.print_url.trim() : null,
            invoiceUrl: null,
          });
        }
      }
      return boletos;
    },
  };
}
