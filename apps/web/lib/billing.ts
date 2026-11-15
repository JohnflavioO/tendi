import type { SupabaseClient } from '@supabase/supabase-js';
import type { PagarmeRequest } from './pagarme';
import type { BillingPeriod } from './billing-format';
import { hasComplimentary, isComplimentaryActive, type ComplimentaryOrganization } from './complimentary';

/**
 * Assinaturas do TendiDesk pela Pagar.me.
 *
 * Fluxo:
 *  1. O Super Admin cola a chave secreta e publica os planos (POST /plans) no painel.
 *  2. O dono do workspace escolhe um plano em /assinatura -> o servidor cria um link de pagamento do
 *     tipo "subscription" (checkout hospedado pela Pagar.me, cartão de crédito) com customer.code = id da empresa.
 *  3. A Pagar.me avisa pelo webhook (assinatura criada, cobrança paga/recusada, cancelamento).
 *     O webhook não traz assinatura digital: o corpo serve só para saber QUAL assinatura mudou.
 *     O estado verdadeiro vem sempre da API (GET /subscriptions/{id}).
 *  4. Assinatura ativa libera a empresa (status 'active' + plano). Cobrança recusada marca 'past_due'
 *     (a Pagar.me ainda tenta de novo, o acesso continua). Cancelada suspende a empresa.
 */

type Db = SupabaseClient<any, any, any>;
type Json = Record<string, any>;

export type BillingStatus = 'active' | 'past_due' | 'canceled';
export type PlatformSecret = 'pagarme_secret_key' | 'pagarme_webhook_secret';

export const SUBSCRIPTION_EVENTS = [
  'subscription.created',
  'subscription.canceled',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.paid',
  'charge.payment_failed',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

// ---------- Segredos da plataforma (Vault) ----------

export async function getPlatformSecret(db: Db, name: PlatformSecret): Promise<string | null> {
  const { data, error } = await db.rpc('get_platform_secret', { p_name: name });
  if (!error && typeof data === 'string' && data.trim()) return data.trim();
  const env = name === 'pagarme_secret_key' ? process.env.PAGARME_SECRET_KEY : process.env.PAGARME_WEBHOOK_SECRET;
  return env?.trim() || null;
}

export async function setPlatformSecret(db: Db, name: PlatformSecret, value: string | null): Promise<string | null> {
  const { error } = await db.rpc('set_platform_secret', { p_name: name, p_value: value ?? '' });
  return error ? error.message : null;
}

// ---------- Montagem das requisições ----------

export function buildPlanPayload(plan: { code: string; name: string; description?: string | null }, priceCents: number) {
  return {
    name: plan.name.slice(0, 64),
    description: (plan.description ?? '').slice(0, 250) || undefined,
    currency: 'BRL',
    interval: 'month',
    interval_count: 1,
    billing_type: 'prepaid',
    payment_methods: ['credit_card'],
    installments: [1],
    statement_descriptor: 'TENDI',
    items: [{ name: plan.name.slice(0, 64), description: plan.name.slice(0, 64), quantity: 1, pricing_scheme: { scheme_type: 'unit', price: priceCents } }],
    metadata: { tendi_plan_code: plan.code },
  };
}

export function buildCheckoutPayload(input: {
  organizationId: string;
  organizationName: string;
  planName: string;
  pagarmePlanId: string;
  customerName: string;
  customerEmail: string | null;
  successUrl: string;
  logoUrl?: string;
}) {
  return {
    name: `${input.planName} · ${input.organizationName}`.slice(0, 64),
    type: 'subscription',
    order_code: input.organizationId,
    // Um pagamento por link e validade de 24 h: cada tentativa gera um link próprio.
    max_paid_sessions: 1,
    expires_in: 24 * 60,
    payment_settings: {
      accepted_payment_methods: ['credit_card'],
      statement_descriptor: 'TENDI',
      credit_card_settings: { operation_type: 'auth_and_capture' },
    },
    cart_settings: { recurrences: [{ plan_id: input.pagarmePlanId, start_in: 1 }] },
    customer_settings: {
      customer: {
        name: input.customerName.slice(0, 64),
        ...(input.customerEmail ? { email: input.customerEmail.slice(0, 64) } : {}),
        // Liga a assinatura à empresa: volta em subscription.customer.code.
        code: input.organizationId,
      },
    },
    layout_settings: { primary_color: '#004751', ...(input.logoUrl ? { image_url: input.logoUrl } : {}) },
    flow_settings: { success_url: input.successUrl },
  };
}

export { annualDiscountPercent, isBillingPeriod, type BillingPeriod } from './billing-format';

/** Confere um plano já existente na Pagar.me (ativo, mensal ou anual) e devolve o preço por ciclo em reais. */
export function readPlanPrice(remote: unknown, period: BillingPeriod = 'monthly'): { ok: true; price: number } | { ok: false; error: string } {
  if (!isRecord(remote)) return { ok: false, error: 'Resposta inválida da Pagar.me.' };
  if (remote.status && remote.status !== 'active') return { ok: false, error: 'Este plano não está ativo na Pagar.me.' };
  const interval = str(remote.interval) ?? 'month';
  const count = Number(remote.interval_count ?? 1);
  const months = interval === 'year' ? count * 12 : interval === 'month' ? count : 0;
  if (period === 'monthly' && months !== 1) return { ok: false, error: 'Este campo é do plano mensal: o plano precisa ter cobrança "Todo mês".' };
  if (period === 'annual' && months !== 12) return { ok: false, error: 'Este campo é do plano anual: o plano precisa ter cobrança "Todo ano".' };
  const items = Array.isArray(remote.items) ? remote.items : [];
  const cents = items.reduce((sum: number, item: any) => {
    const price = Number(item?.pricing_scheme?.price ?? 0);
    const quantity = Number(item?.quantity ?? 1) || 1;
    return sum + (Number.isFinite(price) ? price * quantity : 0);
  }, 0);
  if (!(cents > 0)) return { ok: false, error: 'Não foi possível ler o valor do plano na Pagar.me.' };
  return { ok: true, price: cents / 100 };
}

// ---------- Webhook ----------

/** Descobre o id da assinatura (sub_...) em eventos de assinatura, fatura ou cobrança. */
export function extractSubscriptionId(type: string, data: unknown): string | null {
  if (!isRecord(data)) return null;
  const candidates: unknown[] = [];
  if (type.startsWith('subscription.')) candidates.push(data.id);
  candidates.push(
    data.subscription_id,
    isRecord(data.subscription) ? data.subscription.id : null,
    isRecord(data.invoice) ? data.invoice.subscription_id : null,
    isRecord(data.invoice) && isRecord(data.invoice.subscription) ? data.invoice.subscription.id : null,
  );
  for (const candidate of candidates) {
    const id = str(candidate);
    if (id && id.startsWith('sub_')) return id;
  }
  return null;
}

export type SubscriptionSnapshot = {
  id: string;
  pagarmeStatus: string;
  organizationId: string | null;
  customerId: string | null;
  customerEmail: string | null;
  planId: string | null;
  cardId: string | null;
  startAt: string | null;
  /** Criada pela troca de plano do TendiDesk (metadata.tendi_plan_change). */
  fromPlanChange: boolean;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cardBrand: string | null;
  cardLastDigits: string | null;
  canceledAt: string | null;
};

export function readSubscription(sub: Json): SubscriptionSnapshot {
  const customer = isRecord(sub.customer) ? sub.customer : {};
  const card = isRecord(sub.card) ? sub.card : {};
  const cycle = isRecord(sub.current_cycle) ? sub.current_cycle : {};
  const code = str(customer.code);
  const last = str(card.last_four_digits);
  return {
    id: String(sub.id),
    pagarmeStatus: str(sub.status) ?? 'unknown',
    organizationId: code && UUID_RE.test(code) ? code : null,
    customerId: str(customer.id),
    customerEmail: str(customer.email)?.toLowerCase() ?? null,
    planId: isRecord(sub.plan) ? str(sub.plan.id) : null,
    cardId: str(card.id),
    startAt: str(sub.start_at),
    fromPlanChange: isRecord(sub.metadata) && str(sub.metadata.tendi_plan_change) === 'true',
    currentPeriodEnd: str(cycle.end_at),
    // Assinatura "future" (troca agendada) vem sem next_billing_at: a primeira cobrança é no start_at.
    nextBillingAt: str(sub.next_billing_at) ?? (sub.status === 'future' ? str(sub.start_at) : null),
    cardBrand: str(card.brand),
    cardLastDigits: last && /^\d{4}$/.test(last) ? last : null,
    canceledAt: str(sub.canceled_at),
  };
}

/** Estado da assinatura no TendiDesk a partir do estado na Pagar.me e do evento que chegou. */
export function nextBillingStatus(pagarmeStatus: string, eventType: string, previous: BillingStatus | null): BillingStatus {
  if (pagarmeStatus === 'canceled' || eventType === 'subscription.canceled') return 'canceled';
  if (eventType === 'charge.payment_failed' || eventType === 'invoice.payment_failed') return 'past_due';
  if (eventType === 'charge.paid' || eventType === 'invoice.paid') return 'active';
  return previous === 'past_due' ? 'past_due' : 'active';
}

/**
 * Assinatura feita por um link manual (sem customer.code): procura a empresa pelo e-mail do pagador.
 * Só aceita quando o e-mail é de um usuário dono/admin de exatamente uma empresa.
 */
export async function findOrganizationByEmail(db: Db, email: string | null): Promise<string | null> {
  if (!email) return null;
  const profiles = await db.from('profiles').select('id').eq('email', email).limit(2);
  const users = ((profiles.data ?? []) as Array<{ id: string }>).map(row => row.id);
  if (users.length !== 1) return null;
  const memberships = await db.from('organization_memberships')
    .select('organization_id')
    .eq('user_id', users[0])
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);
  const orgs = [...new Set(((memberships.data ?? []) as Array<{ organization_id: string }>).map(row => row.organization_id))];
  return orgs.length === 1 ? orgs[0]! : null;
}

export type SyncResult ={ organizationId: string | null; status: BillingStatus | null; reason?: string };

/** Busca a assinatura na Pagar.me e aplica o estado no TendiDesk (assinatura + empresa). Idempotente. */
export async function syncSubscription(db: Db, api: PagarmeRequest, subscriptionId: string, eventType: string, now = new Date()): Promise<SyncResult> {
  const snapshot = readSubscription(await api(`/subscriptions/${encodeURIComponent(subscriptionId)}`));

  const byProvider = await db.from('billing_subscriptions').select('*').eq('provider_subscription_id', snapshot.id).maybeSingle();
  if (byProvider.error) throw new Error(`billing_subscriptions: ${byProvider.error.message}`);
  const organizationId = snapshot.organizationId
    ?? (byProvider.data?.organization_id as string | undefined)
    ?? (await findOrganizationByEmail(db, snapshot.customerEmail));
  if (!organizationId) return { organizationId: null, status: null, reason: 'subscription_without_organization' };

  // '*' traz as colunas da cortesia sem depender de a migração já estar aplicada.
  const org = await db.from('organizations').select('*').eq('id', organizationId).maybeSingle();
  if (!org.data) return { organizationId, status: null, reason: 'organization_not_found' };

  const current = await db.from('billing_subscriptions').select('*').eq('organization_id', organizationId).maybeSingle();
  const existing = current.data as Json | null;
  const status = nextBillingStatus(snapshot.pagarmeStatus, eventType, existing?.provider_subscription_id === snapshot.id ? existing.status : null);

  // Evento atrasado de uma assinatura antiga não pode derrubar a assinatura atual da empresa.
  if (existing && existing.provider_subscription_id && existing.provider_subscription_id !== snapshot.id
      && existing.status !== 'canceled' && status === 'canceled') {
    return { organizationId, status: existing.status as BillingStatus, reason: 'stale_subscription' };
  }

  // O plano da Pagar.me pode ser a versão mensal ou a anual de um plano do TendiDesk.
  let planCode: string | null = (existing?.plan_code as string | undefined) ?? null;
  let billingPeriod: BillingPeriod = existing?.billing_period === 'annual' ? 'annual' : 'monthly';
  if (snapshot.planId) {
    const monthly = await db.from('subscription_plans').select('code').eq('pagarme_plan_id', snapshot.planId).maybeSingle();
    const annual = monthly.data ? null : await db.from('subscription_plans').select('code').eq('pagarme_annual_plan_id', snapshot.planId).maybeSingle();
    const found = (monthly.data ?? annual?.data) as { code: string } | null;
    if (found) {
      planCode = found.code;
      billingPeriod = monthly.data ? 'monthly' : 'annual';
    }
  }

  const row = {
    organization_id: organizationId,
    provider: 'pagarme',
    provider_subscription_id: snapshot.id,
    provider_customer_id: snapshot.customerId,
    plan_code: planCode,
    billing_period: billingPeriod,
    status,
    current_period_end: snapshot.currentPeriodEnd,
    next_billing_at: snapshot.nextBillingAt,
    card_brand: snapshot.cardBrand,
    card_last_digits: snapshot.cardLastDigits,
    canceled_at: status === 'canceled' ? (snapshot.canceledAt ?? now.toISOString()) : null,
    last_event_type: eventType,
    last_synced_at: now.toISOString(),
  };
  const saved = await db.from('billing_subscriptions').upsert(row, { onConflict: 'organization_id' });
  if (saved.error) throw new Error(`billing_subscriptions.upsert: ${saved.error.message}`);

  // Conta cortesia: um cancelamento não tira o acesso que o Super Admin liberou.
  // Assinatura ativa encerra a cortesia: a empresa passou a pagar.
  const complimentary = isComplimentaryActive(org.data as ComplimentaryOrganization, now);
  if (status === 'canceled' && complimentary) return { organizationId, status, reason: 'complimentary_kept' };
  // Assinatura "future" (troca de plano agendada) ainda não vale: o plano da empresa só muda quando ela começar.
  const scheduledChange = snapshot.pagarmeStatus === 'future' && snapshot.fromPlanChange;
  const orgPatch = status === 'canceled'
    ? { status: 'suspended' }
    : {
      status: 'active',
      ...(planCode && !scheduledChange ? { plan_code: planCode } : {}),
      ...(status === 'active' && hasComplimentary(org.data as ComplimentaryOrganization)
        ? { complimentary_since: null, complimentary_until: null, complimentary_reason: null, complimentary_by: null }
        : {}),
    };
  const updated = await db.from('organizations').update(orgPatch).eq('id', organizationId);
  if (updated.error) throw new Error(`organizations.update: ${updated.error.message}`);

  return { organizationId, status };
}

// ---------- Troca de plano ----------

/**
 * A Pagar.me v5 não troca o plano de uma assinatura. A troca cria uma assinatura nova no plano escolhido,
 * com o mesmo cliente e o mesmo cartão salvo, começando na próxima data de cobrança (status "future"),
 * e cancela a antiga. Não há cobrança extra nem reembolso no dia da troca:
 *  - Subida: os recursos do plano novo liberam na hora; o valor novo vale a partir da próxima cobrança.
 *  - Descida: o plano atual continua até o fim do período já pago; o plano novo começa na próxima cobrança.
 * O período (mensal/anual) continua o mesmo.
 */
export function buildPlanChangePayload(input: {
  organizationId: string;
  planCode: string;
  pagarmePlanId: string;
  customerId: string;
  cardId: string;
  startAt: string;
  replacesSubscriptionId: string;
}) {
  return {
    plan_id: input.pagarmePlanId,
    payment_method: 'credit_card',
    customer_id: input.customerId,
    card_id: input.cardId,
    start_at: input.startAt,
    installments: 1,
    statement_descriptor: 'TENDI',
    metadata: {
      tendi_organization_id: input.organizationId,
      tendi_plan_code: input.planCode,
      tendi_plan_change: 'true',
      tendi_replaces_subscription: input.replacesSubscriptionId,
    },
  };
}

export type PlanChangeDirection = 'upgrade' | 'downgrade';
export type PlanChangeResult =
  | { ok: true; direction: PlanChangeDirection; subscriptionId: string; startsAt: string; planCode: string; price: number; billingPeriod: BillingPeriod }
  | { ok: false; status: number; error: string };

const PLAN_CHANGE_LOCK = 'tendi_plan_change';

export async function changeSubscriptionPlan(db: Db, api: PagarmeRequest, input: { organizationId: string; planCode: string }, now = new Date()): Promise<PlanChangeResult> {
  const fail = (status: number, error: string): PlanChangeResult => ({ ok: false, status, error });

  const current = await db.from('billing_subscriptions').select('*').eq('organization_id', input.organizationId).maybeSingle();
  const row = current.data ? { ...(current.data as Json) } : null; // cópia: usada para desfazer a troca
  if (!row?.provider_subscription_id || row.status === 'canceled') return fail(409, 'Este workspace não tem uma assinatura ativa. Assine um plano primeiro.');
  if (row.status !== 'active') return fail(409, 'Há um pagamento pendente nesta assinatura. Regularize o cartão antes de trocar de plano.');
  if (row.plan_code === input.planCode) return fail(409, 'Este já é o plano da sua assinatura.');

  const period: BillingPeriod = row.billing_period === 'annual' ? 'annual' : 'monthly';
  const columns = 'code,name,is_active,monthly_price,annual_price,pagarme_plan_id,pagarme_annual_plan_id';
  const [{ data: target }, { data: from }] = await Promise.all([
    db.from('subscription_plans').select(columns).eq('code', input.planCode).maybeSingle(),
    row.plan_code ? db.from('subscription_plans').select(columns).eq('code', row.plan_code).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const targetPlanId = (period === 'annual' ? target?.pagarme_annual_plan_id : target?.pagarme_plan_id) as string | null | undefined;
  const targetPrice = Number((period === 'annual' ? target?.annual_price : target?.monthly_price) ?? 0);
  if (!target?.is_active || !targetPlanId || !(targetPrice > 0)) return fail(409, 'Este plano não está disponível para troca no momento.');
  const fromPrice = Number((period === 'annual' ? from?.annual_price : from?.monthly_price) ?? 0);
  const direction: PlanChangeDirection = fromPrice > targetPrice ? 'downgrade' : 'upgrade';

  // O estado verdadeiro vem da Pagar.me: cliente, cartão salvo e data da próxima cobrança.
  const oldId = String(row.provider_subscription_id);
  const live = readSubscription(await api(`/subscriptions/${encodeURIComponent(oldId)}`));
  if (live.pagarmeStatus !== 'active' && live.pagarmeStatus !== 'future') return fail(409, 'A assinatura não está ativa na Pagar.me. Fale com o suporte.');
  if (live.organizationId && live.organizationId !== input.organizationId) return fail(409, 'A assinatura não pertence a este workspace.');
  const startAt = live.pagarmeStatus === 'future' ? (live.startAt ?? live.nextBillingAt) : live.nextBillingAt;
  if (!live.customerId || !live.cardId || !startAt) return fail(409, 'Não encontramos o cartão desta assinatura na Pagar.me. Fale com o suporte.');
  if (!(new Date(startAt).getTime() > now.getTime())) return fail(409, 'A cobrança deste ciclo está sendo processada. Tente trocar de plano amanhã.');

  // Trava contra dois pedidos ao mesmo tempo (cliques repetidos criariam duas assinaturas).
  const lock = await db.from('billing_subscriptions')
    .update({ last_event_type: PLAN_CHANGE_LOCK })
    .eq('organization_id', input.organizationId)
    .eq('provider_subscription_id', oldId)
    .or(`last_event_type.is.null,last_event_type.neq.${PLAN_CHANGE_LOCK}`)
    .select('id');
  if (lock.error) throw new Error(`billing_subscriptions.lock: ${lock.error.message}`);
  if (!lock.data?.length) return fail(409, 'Já existe uma troca de plano em andamento. Aguarde alguns segundos e atualize a página.');
  const release = () => db.from('billing_subscriptions').update({ last_event_type: row.last_event_type ?? null })
    .eq('organization_id', input.organizationId).eq('provider_subscription_id', oldId);

  let newId: string | null = null;
  try {
    const created = await api<Json>('/subscriptions', {
      method: 'POST',
      body: buildPlanChangePayload({
        organizationId: input.organizationId,
        planCode: input.planCode,
        pagarmePlanId: targetPlanId,
        customerId: live.customerId,
        cardId: live.cardId,
        startAt,
        replacesSubscriptionId: oldId,
      }),
    });
    newId = str(created?.id);
    if (!newId) throw new Error('A Pagar.me não devolveu a assinatura nova.');

    // Grava a assinatura nova ANTES de cancelar a antiga: o webhook do cancelamento vira evento atrasado e é ignorado.
    const saved = await db.from('billing_subscriptions').upsert({
      organization_id: input.organizationId,
      provider: 'pagarme',
      provider_subscription_id: newId,
      provider_customer_id: live.customerId,
      plan_code: input.planCode,
      billing_period: period,
      status: 'active',
      next_billing_at: startAt,
      card_brand: live.cardBrand ?? row.card_brand ?? null,
      card_last_digits: live.cardLastDigits ?? row.card_last_digits ?? null,
      canceled_at: null,
      // A linha já aponta para a assinatura nova: pedidos atrasados com o id antigo não passam da trava.
      last_event_type: 'tendi_plan_changed',
      last_synced_at: now.toISOString(),
    }, { onConflict: 'organization_id' });
    if (saved.error) throw new Error(`billing_subscriptions.upsert: ${saved.error.message}`);
  } catch (error) {
    if (newId) await api(`/subscriptions/${encodeURIComponent(newId)}`, { method: 'DELETE', body: { cancel_pending_invoices: true } }).catch(() => null);
    await release();
    throw error;
  }

  try {
    await api(`/subscriptions/${encodeURIComponent(oldId)}`, { method: 'DELETE', body: { cancel_pending_invoices: true } });
  } catch (error) {
    // Não conseguiu cancelar a antiga: desfaz a nova para o cliente nunca ficar com duas assinaturas.
    const undone = await api(`/subscriptions/${encodeURIComponent(newId)}`, { method: 'DELETE', body: { cancel_pending_invoices: true } }).then(() => true, () => false);
    await db.from('billing_subscriptions').upsert({ ...row, last_event_type: row.last_event_type ?? null }, { onConflict: 'organization_id' });
    if (!undone) console.error('[Pagar.me troca de plano] duas assinaturas ativas, cancele uma manualmente', { organizationId: input.organizationId, oldId, newId });
    throw error;
  }

  // Subida libera os recursos na hora. Descida espera a assinatura nova começar (o webhook aplica).
  if (direction === 'upgrade') {
    const updated = await db.from('organizations').update({ plan_code: input.planCode, status: 'active' }).eq('id', input.organizationId);
    if (updated.error) throw new Error(`organizations.update: ${updated.error.message}`);
  }

  return { ok: true, direction, subscriptionId: newId, startsAt: startAt, planCode: input.planCode, price: targetPrice, billingPeriod: period };
}

export type WebhookOutcome = { status: number; body: Json };

/** Processa um evento do webhook da Pagar.me. Repetições do mesmo evento são ignoradas. */
export async function processPagarmeEvent(db: Db, api: PagarmeRequest, payload: unknown): Promise<WebhookOutcome> {
  if (!isRecord(payload)) return { status: 400, body: { error: 'Corpo inválido.' } };
  const eventId = str(payload.id);
  const type = str(payload.type);
  if (!eventId || !type) return { status: 400, body: { error: 'Evento sem id ou tipo.' } };

  const subscriptionId = extractSubscriptionId(type, payload.data);
  const known = await db.from('billing_events').select('id,processed_at').eq('id', eventId).maybeSingle();
  if (known.data?.processed_at) return { status: 200, body: { ok: true, duplicate: true } };
  if (!known.data) {
    const inserted = await db.from('billing_events').insert({ id: eventId, type, subscription_id: subscriptionId });
    if (inserted.error && inserted.error.code !== '23505') throw new Error(`billing_events.insert: ${inserted.error.message}`);
  }

  if (!subscriptionId || !(SUBSCRIPTION_EVENTS as readonly string[]).includes(type)) {
    await db.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId);
    return { status: 200, body: { ok: true, ignored: true } };
  }

  try {
    const result = await syncSubscription(db, api, subscriptionId, type);
    await db.from('billing_events')
      .update({ processed_at: new Date().toISOString(), organization_id: result.organizationId, error: result.reason ?? null })
      .eq('id', eventId);
    return { status: 200, body: { ok: true, status: result.status, reason: result.reason } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('billing_events').update({ error: message.slice(0, 500) }).eq('id', eventId);
    throw error;
  }
}
