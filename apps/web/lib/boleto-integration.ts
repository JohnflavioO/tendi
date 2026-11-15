import type { SupabaseClient } from '@supabase/supabase-js';
import { isBoletoProviderId, keyHint, maskDocument, normalizeDocument, sortBoletos, type BoletoProvider, type BoletoProviderId } from './boleto';
import { organizationHasBoletoPlan } from './boleto-server';
import { AsaasError, friendlyAsaasError, looksLikeAsaasKey } from './boleto-asaas';

/**
 * Regras da tela Integrações > 2ª via de boleto (usadas pelas rotas /api/integrations/boleto).
 * `db` é o cliente de serviço: grava a integração e guarda a chave no Vault. Quem chama já conferiu
 * que a pessoa é dona ou administradora da empresa.
 */

type Db = SupabaseClient<any, any, any>;
export type Outcome = { status: number; body: Record<string, unknown> };
export type ProviderFactory = (id: BoletoProviderId) => BoletoProvider;

export const UPGRADE_MESSAGE = 'A 2ª via de boleto faz parte do plano TendiDesk Pro.';
const COLUMNS = 'id,provider,status,environment,account_label,key_hint,is_enabled,last_verified_at,last_error,updated_at';

const fail = (status: number, error: string): Outcome => ({ status, body: { error } });

export async function readIntegration(db: Db, organizationId: string): Promise<Outcome> {
  const planAllowed = await organizationHasBoletoPlan(db, organizationId);
  const { data, error } = await db.from('billing_integrations').select(COLUMNS).eq('organization_id', organizationId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  // Sem a tabela (migração ainda não aplicada): a tela mostra o recurso como indisponível.
  if (error) return { status: 200, body: { planAllowed, ready: false, integration: null } };
  return { status: 200, body: { planAllowed, ready: true, integration: data ?? null } };
}

export async function connectIntegration(db: Db, organizationId: string, input: { provider: unknown; apiKey: unknown }, providers: ProviderFactory): Promise<Outcome> {
  if (!(await organizationHasBoletoPlan(db, organizationId))) return fail(403, UPGRADE_MESSAGE);
  if (!isBoletoProviderId(input.provider)) return fail(400, 'Escolha o sistema de cobrança.');
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (input.provider === 'asaas' && !looksLikeAsaasKey(apiKey)) return fail(400, 'Essa não parece uma chave do Asaas. Ela começa com $aact_ e é bem longa.');

  let account;
  try {
    account = await providers(input.provider).verify(apiKey);
  } catch (error) {
    return fail(400, friendlyAsaasError(error));
  }

  const now = new Date().toISOString();
  const { data: row, error } = await db.from('billing_integrations').upsert({
    organization_id: organizationId,
    provider: input.provider,
    status: 'connected',
    environment: account.environment,
    account_label: account.accountLabel,
    key_hint: keyHint(apiKey),
    is_enabled: true,
    last_verified_at: now,
    last_error: null,
  }, { onConflict: 'organization_id,provider' }).select(COLUMNS).single();
  if (error || !row) return fail(500, 'Não foi possível salvar a integração. Tente de novo.');

  const secret = await db.rpc('set_billing_secret', { p_integration_id: (row as { id: string }).id, p_value: apiKey });
  if (secret.error) {
    await db.from('billing_integrations').delete().eq('id', (row as { id: string }).id);
    return fail(500, 'Não foi possível guardar a chave com segurança. Tente de novo.');
  }
  return { status: 200, body: { integration: row } };
}

export async function setIntegrationEnabled(db: Db, organizationId: string, enabled: unknown): Promise<Outcome> {
  if (typeof enabled !== 'boolean') return fail(400, 'Valor inválido.');
  if (enabled && !(await organizationHasBoletoPlan(db, organizationId))) return fail(403, UPGRADE_MESSAGE);
  const { data, error } = await db.from('billing_integrations').update({ is_enabled: enabled })
    .eq('organization_id', organizationId).select(COLUMNS).maybeSingle();
  if (error) return fail(500, 'Não foi possível salvar. Tente de novo.');
  if (!data) return fail(404, 'Nenhum sistema de cobrança conectado.');
  return { status: 200, body: { integration: data } };
}

/** Desconecta: apaga a linha e, pelo gatilho do banco, a chave guardada no Vault. */
export async function disconnectIntegration(db: Db, organizationId: string): Promise<Outcome> {
  const { data: rows } = await db.from('billing_integrations').select('id').eq('organization_id', organizationId);
  for (const row of (rows ?? []) as Array<{ id: string }>) {
    await db.rpc('set_billing_secret', { p_integration_id: row.id, p_value: '' });
  }
  const { error } = await db.from('billing_integrations').delete().eq('organization_id', organizationId);
  if (error) return fail(500, 'Não foi possível desconectar. Tente de novo.');
  return { status: 200, body: { success: true } };
}

/** Teste da tela: busca os boletos de um CPF/CNPJ sem enviar nada a ninguém. */
export async function testLookup(db: Db, organizationId: string, documentInput: unknown, providers: ProviderFactory): Promise<Outcome> {
  if (!(await organizationHasBoletoPlan(db, organizationId))) return fail(403, UPGRADE_MESSAGE);
  const document = normalizeDocument(typeof documentInput === 'string' ? documentInput : '');
  if (!document) return fail(400, 'Informe um CPF ou CNPJ válido.');
  const { data: row } = await db.from('billing_integrations').select('id,provider').eq('organization_id', organizationId).maybeSingle();
  const integration = row as { id: string; provider: BoletoProviderId } | null;
  if (!integration) return fail(404, 'Conecte o sistema de cobrança primeiro.');
  const { data: apiKey } = await db.rpc('get_billing_secret', { p_integration_id: integration.id });
  if (typeof apiKey !== 'string' || !apiKey) return fail(409, 'A chave guardada não foi encontrada. Conecte de novo.');
  try {
    const boletos = sortBoletos(await providers(integration.provider).findOpenBoletos(apiKey, document));
    await db.from('billing_integrations').update({ status: 'connected', last_error: null, last_verified_at: new Date().toISOString() }).eq('id', integration.id);
    return {
      status: 200,
      body: {
        document: maskDocument(document),
        count: boletos.length,
        boletos: boletos.slice(0, 3).map(boleto => ({ amount: boleto.amount, dueDate: boleto.dueDate, overdue: boleto.overdue, hasDigitableLine: Boolean(boleto.digitableLine), hasPdf: Boolean(boleto.pdfUrl ?? boleto.invoiceUrl) })),
      },
    };
  } catch (error) {
    const message = friendlyAsaasError(error);
    // Chave recusada para de vez a 2ª via pela Duda; falha passageira (lentidão, limite) só fica anotada.
    const keyRejected = error instanceof AsaasError && (error.status === 401 || error.status === 403);
    await db.from('billing_integrations').update({ ...(keyRejected ? { status: 'error' } : {}), last_error: message.slice(0, 300) }).eq('id', integration.id);
    return fail(502, message);
  }
}
