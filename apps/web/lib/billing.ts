import type { SupabaseClient } from '@supabase/supabase-js';
import type { PagarmeRequest } from './pagarme';

/**
 * Assinaturas do Tendi pela Pagar.me.
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
    name: `Tendi ${input.planName} · ${input.organizationName}`.slice(0, 64),
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
  planId: string | null;
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
    planId: isRecord(sub.plan) ? str(sub.plan.id) : null,
    currentPeriodEnd: str(cycle.end_at),
    nextBillingAt: str(sub.next_billing_at),
    cardBrand: str(card.brand),
    cardLastDigits: last && /^\d{4}$/.test(last) ? last : null,
    canceledAt: str(sub.canceled_at),
  };
}

/** Estado da assinatura no Tendi a partir do estado na Pagar.me e do evento que chegou. */
export function nextBillingStatus(pagarmeStatus: string, eventType: string, previous: BillingStatus | null): BillingStatus {
  if (pagarmeStatus === 'canceled' || eventType === 'subscription.canceled') return 'canceled';
  if (eventType === 'charge.payment_failed' || eventType === 'invoice.payment_failed') return 'past_due';
  if (eventType === 'charge.paid' || eventType === 'invoice.paid') return 'active';
  return previous === 'past_due' ? 'past_due' : 'active';
}

export type SyncResult = { organizationId: string | null; status: BillingStatus | null; reason?: string };

/** Busca a assinatura na Pagar.me e aplica o estado no Tendi (assinatura + empresa). Idempotente. */
export async function syncSubscription(db: Db, api: PagarmeRequest, subscriptionId: string, eventType: string, now = new Date()): Promise<SyncResult> {
  const snapshot = readSubscription(await api(`/subscriptions/${encodeURIComponent(subscriptionId)}`));

  const byProvider = await db.from('billing_subscriptions').select('*').eq('provider_subscription_id', snapshot.id).maybeSingle();
  if (byProvider.error) throw new Error(`billing_subscriptions: ${byProvider.error.message}`);
  const organizationId = snapshot.organizationId ?? (byProvider.data?.organization_id as string | undefined) ?? null;
  if (!organizationId) return { organizationId: null, status: null, reason: 'subscription_without_organization' };

  const org = await db.from('organizations').select('id,status').eq('id', organizationId).maybeSingle();
  if (!org.data) return { organizationId, status: null, reason: 'organization_not_found' };

  const current = await db.from('billing_subscriptions').select('*').eq('organization_id', organizationId).maybeSingle();
  const existing = current.data as Json | null;
  const status = nextBillingStatus(snapshot.pagarmeStatus, eventType, existing?.provider_subscription_id === snapshot.id ? existing.status : null);

  // Evento atrasado de uma assinatura antiga não pode derrubar a assinatura atual da empresa.
  if (existing && existing.provider_subscription_id && existing.provider_subscription_id !== snapshot.id
      && existing.status !== 'canceled' && status === 'canceled') {
    return { organizationId, status: existing.status as BillingStatus, reason: 'stale_subscription' };
  }

  let planCode: string | null = (existing?.plan_code as string | undefined) ?? null;
  if (snapshot.planId) {
    const plan = await db.from('subscription_plans').select('code').eq('pagarme_plan_id', snapshot.planId).maybeSingle();
    planCode = (plan.data?.code as string | undefined) ?? planCode;
  }

  const row = {
    organization_id: organizationId,
    provider: 'pagarme',
    provider_subscription_id: snapshot.id,
    provider_customer_id: snapshot.customerId,
    plan_code: planCode,
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

  const orgPatch = status === 'canceled'
    ? { status: 'suspended' }
    : { status: 'active', ...(planCode ? { plan_code: planCode } : {}) };
  const updated = await db.from('organizations').update(orgPatch).eq('id', organizationId);
  if (updated.error) throw new Error(`organizations.update: ${updated.error.message}`);

  return { organizationId, status };
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
