import type { BoletoProvider, OpenBoleto, ProviderAccount } from './boleto';

/**
 * Asaas (https://docs.asaas.com). A chave de produção começa com $aact_prod_ e a do sandbox com
 * $aact_hmlg_; o ambiente sai da própria chave. Usa só leitura: clientes, cobranças e linha digitável.
 */

type FetchFn = typeof fetch;
const PRODUCTION_URL = 'https://api.asaas.com/v3';
const SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
const OPEN_STATUSES = new Set(['PENDING', 'OVERDUE']);
/** Cobranças que geram boleto: BOLETO e "pergunte ao cliente" (UNDEFINED). */
const BOLETO_TYPES = new Set(['BOLETO', 'UNDEFINED']);
const MAX_CUSTOMERS = 5;

export function asaasEnvironment(apiKey: string): ProviderAccount['environment'] {
  return /^\$?aact_hmlg_/.test(apiKey.trim()) ? 'sandbox' : 'production';
}

export function looksLikeAsaasKey(apiKey: string): boolean {
  return /^\$aact_[A-Za-z0-9_:\-$=+/.]{20,}$/.test(apiKey.trim());
}

export class AsaasError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Mensagem curta para a tela de Integrações. */
export function friendlyAsaasError(error: unknown): string {
  if (error instanceof AsaasError) {
    if (error.status === 401) return 'O Asaas recusou a chave. Confira se copiou a chave inteira e se ela não foi apagada.';
    if (error.status === 403) return 'A chave do Asaas não tem permissão para ler clientes e cobranças.';
    if (error.status === 429) return 'O Asaas pediu uma pausa nas consultas. Tente de novo em alguns minutos.';
    return `O Asaas respondeu com erro (${error.status}).`;
  }
  if (error instanceof Error && /timeout|abort/i.test(error.name + error.message)) return 'O Asaas demorou para responder. Tente de novo.';
  return 'Não foi possível falar com o Asaas agora.';
}

export function createAsaasProvider(fetchFn: FetchFn = fetch): BoletoProvider {
  async function get<T>(apiKey: string, path: string): Promise<T> {
    const base = asaasEnvironment(apiKey) === 'sandbox' ? SANDBOX_URL : PRODUCTION_URL;
    const response = await fetchFn(`${base}${path}`, {
      headers: { access_token: apiKey.trim(), 'content-type': 'application/json', 'user-agent': 'TendiDesk' },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new AsaasError(`Asaas HTTP ${response.status}`, response.status);
    return (await response.json()) as T;
  }

  return {
    id: 'asaas',
    label: 'Asaas',

    async verify(apiKey) {
      await get(apiKey, '/customers?limit=1');
      let accountLabel: string | null = null;
      try {
        const info = await get<{ companyName?: string; name?: string }>(apiKey, '/myAccount/commercialInfo');
        accountLabel = (info.companyName || info.name || '').trim().slice(0, 120) || null;
      } catch {
        // Nome da conta é só um detalhe da tela; a chave já foi validada acima.
      }
      return { environment: asaasEnvironment(apiKey), accountLabel };
    },

    async findOpenBoletos(apiKey, document) {
      const customers = await get<{ data?: Array<{ id: string; deleted?: boolean }> }>(apiKey, `/customers?cpfCnpj=${encodeURIComponent(document)}&limit=${MAX_CUSTOMERS}`);
      const ids = (customers.data ?? []).filter(customer => customer.id && !customer.deleted).map(customer => customer.id);
      const boletos: OpenBoleto[] = [];
      for (const customerId of ids) {
        for (const status of ['OVERDUE', 'PENDING']) {
          const payments = await get<{ data?: any[] }>(apiKey, `/payments?customer=${encodeURIComponent(customerId)}&status=${status}&limit=20`);
          for (const payment of payments.data ?? []) {
            if (payment?.deleted || !OPEN_STATUSES.has(payment?.status) || !BOLETO_TYPES.has(payment?.billingType)) continue;
            if (typeof payment.id !== 'string' || typeof payment.dueDate !== 'string') continue;
            boletos.push({
              id: payment.id,
              amount: Number(payment.value) || 0,
              dueDate: payment.dueDate,
              overdue: payment.status === 'OVERDUE',
              description: typeof payment.description === 'string' && payment.description.trim() ? payment.description.trim() : null,
              digitableLine: null,
              pdfUrl: typeof payment.bankSlipUrl === 'string' ? payment.bankSlipUrl : null,
              invoiceUrl: typeof payment.invoiceUrl === 'string' ? payment.invoiceUrl : null,
            });
          }
        }
      }
      // Linha digitável só dos que vão na mensagem (vencimento mais próximo primeiro).
      boletos.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      for (const boleto of boletos.slice(0, 3)) {
        try {
          const field = await get<{ identificationField?: string }>(apiKey, `/payments/${encodeURIComponent(boleto.id)}/identificationField`);
          boleto.digitableLine = typeof field.identificationField === 'string' && field.identificationField.trim() ? field.identificationField.trim() : null;
        } catch {
          // Boleto ainda sem registro no banco: segue só com o link do PDF.
        }
      }
      return boletos;
    },
  };
}
