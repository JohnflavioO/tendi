import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoletoProvider, BoletoProviderId, OpenBoleto } from './boleto';
import { createAsaasProvider } from './boleto-asaas';

/**
 * Lado do servidor da 2ª via: confere o plano, lê a integração e tira a chave do Vault.
 * `db` precisa ser o cliente de serviço (get_billing_secret só roda com a chave de serviço).
 */

type Db = SupabaseClient<any, any, any>;

export function getBoletoProvider(id: BoletoProviderId, fetchFn?: typeof fetch): BoletoProvider {
  switch (id) {
    case 'asaas': return createAsaasProvider(fetchFn);
  }
}

/** O plano da empresa inclui a 2ª via de boleto? (coluna subscription_plans.boleto_second_copy_enabled) */
export async function organizationHasBoletoPlan(db: Db, organizationId: string): Promise<boolean> {
  const { data: org } = await db.from('organizations').select('plan_code').eq('id', organizationId).maybeSingle();
  const planCode = (org as { plan_code?: string | null } | null)?.plan_code;
  if (!planCode) return false;
  const { data: plan } = await db.from('subscription_plans').select('boleto_second_copy_enabled').eq('code', planCode).maybeSingle();
  return (plan as { boleto_second_copy_enabled?: boolean } | null)?.boleto_second_copy_enabled === true;
}

/** O que a resposta automática da IA usa (fácil de trocar por um falso nos testes). */
export type BoletoService = {
  /** Plano Pro + integração conectada e ligada. */
  available(organizationId: string): Promise<boolean>;
  /** Lança erro se o provedor falhar; lista vazia = nada em aberto. */
  find(organizationId: string, document: string): Promise<OpenBoleto[]>;
};

type Integration = { id: string; provider: BoletoProviderId };

export function createBoletoService(db: Db, fetchFn?: typeof fetch): BoletoService {
  const cache = new Map<string, Integration | null>();

  async function integrationFor(organizationId: string): Promise<Integration | null> {
    if (cache.has(organizationId)) return cache.get(organizationId)!;
    let result: Integration | null = null;
    if (await organizationHasBoletoPlan(db, organizationId)) {
      const { data, error } = await db.from('billing_integrations').select('id,provider,status,is_enabled')
        .eq('organization_id', organizationId).eq('status', 'connected').eq('is_enabled', true)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      // Banco ainda sem a tabela (migração não aplicada): segue sem a 2ª via.
      if (!error && data) result = { id: (data as any).id, provider: (data as any).provider };
    }
    cache.set(organizationId, result);
    return result;
  }

  return {
    async available(organizationId) {
      return Boolean(await integrationFor(organizationId));
    },
    async find(organizationId, document) {
      const integration = await integrationFor(organizationId);
      if (!integration) throw new Error('Integração de cobrança indisponível.');
      const { data: apiKey, error } = await db.rpc('get_billing_secret', { p_integration_id: integration.id });
      if (error || typeof apiKey !== 'string' || !apiKey) throw new Error('Chave do sistema de cobrança não encontrada.');
      return getBoletoProvider(integration.provider, fetchFn).findOpenBoletos(apiKey, document);
    },
  };
}
