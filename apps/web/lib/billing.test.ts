import { describe, expect, it, vi } from 'vitest';
import { buildCheckoutPayload, buildPlanPayload, extractSubscriptionId, nextBillingStatus, processPagarmeEvent, readSubscription } from './billing';
import { pagarmeBaseUrl, toCents, validateSecretKey } from './pagarme';
import { isOrganizationBlocked, shouldBlockAccess } from './trial';

type Row = Record<string, any>;
const UNIQUE: Record<string, string> = { billing_events: 'id' };
class FakeDb {
  t: Record<string, Row[]> = { organizations: [], subscription_plans: [], billing_subscriptions: [], billing_events: [] };
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode = 'select'; preds: Array<(r: Row) => boolean> = []; payload: any; conflict = '';
  constructor(private db: FakeDb, private table: string) {}
  select() { return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  upsert(row: Row, opts: { onConflict: string }) { this.mode = 'upsert'; this.payload = row; this.conflict = opts.onConflict; return this; }
  eq(c: string, v: any) { this.preds.push(r => r[c] === v); return this; }
  private run(): any {
    const rows = this.db.t[this.table]!;
    if (this.mode === 'insert') {
      const key = UNIQUE[this.table];
      if (key && rows.some(r => r[key] === this.payload[key])) return { data: null, error: { code: '23505', message: 'duplicate' } };
      rows.push({ ...this.payload }); return { data: null, error: null };
    }
    if (this.mode === 'upsert') {
      const found = rows.find(r => r[this.conflict] === this.payload[this.conflict]);
      if (found) Object.assign(found, this.payload); else rows.push({ ...this.payload });
      return { data: null, error: null };
    }
    const matched = rows.filter(r => this.preds.every(p => p(r)));
    if (this.mode === 'update') { matched.forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    return { data: matched, error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

const ORG = '11111111-1111-4111-8111-111111111111';
const subscription = (over: Row = {}) => ({
  id: 'sub_abc', status: 'active', next_billing_at: '2026-12-12T00:00:00Z',
  customer: { id: 'cus_1', code: ORG }, plan: { id: 'plan_start' },
  card: { brand: 'Visa', last_four_digits: '4242' }, current_cycle: { end_at: '2026-12-11T23:59:59Z' }, ...over,
});

function setup(sub: Row = subscription()) {
  const db = new FakeDb();
  db.t.organizations.push({ id: ORG, status: 'trial', plan_code: 'starter', trial_ends_at: '2026-11-01T00:00:00Z' });
  db.t.subscription_plans.push({ code: 'tendi_start', pagarme_plan_id: 'plan_start' }, { code: 'tendi_pro', pagarme_plan_id: 'plan_pro' });
  const api = vi.fn(async (_path: string) => sub);
  const send = (id: string, type: string, data: Row = { id: 'sub_abc' }) => processPagarmeEvent(db as any, api as any, { id, type, data });
  return { db, api, send };
}

describe('processPagarmeEvent', () => {
  it('assinatura criada: consulta a API, grava a assinatura e libera a empresa no plano pago', async () => {
    const { db, api, send } = setup();
    const result = await send('hook_1', 'subscription.created');
    expect(result).toMatchObject({ status: 200, body: { ok: true, status: 'active' } });
    expect(api).toHaveBeenCalledWith('/subscriptions/sub_abc');
    expect(db.t.billing_subscriptions[0]).toMatchObject({ organization_id: ORG, provider_subscription_id: 'sub_abc', plan_code: 'tendi_start', status: 'active', card_last_digits: '4242' });
    expect(db.t.organizations[0]).toMatchObject({ status: 'active', plan_code: 'tendi_start' });
  });

  it('mesmo evento duas vezes só processa uma', async () => {
    const { api, send } = setup();
    await send('hook_1', 'subscription.created');
    expect((await send('hook_1', 'subscription.created')).body).toMatchObject({ duplicate: true });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('cobrança recusada marca pagamento pendente sem tirar o acesso; cobrança paga volta a ativa', async () => {
    const { db, send } = setup();
    await send('hook_1', 'subscription.created');
    await send('hook_2', 'charge.payment_failed', { id: 'ch_1', invoice: { subscription_id: 'sub_abc' } });
    expect(db.t.billing_subscriptions[0]!.status).toBe('past_due');
    expect(db.t.organizations[0]!.status).toBe('active');
    await send('hook_3', 'invoice.updated', { id: 'in_1', subscription: { id: 'sub_abc' } });
    expect(db.t.billing_subscriptions[0]!.status).toBe('past_due');
    await send('hook_4', 'charge.paid', { id: 'ch_2', invoice: { subscription_id: 'sub_abc' } });
    expect(db.t.billing_subscriptions[0]!.status).toBe('active');
  });

  it('assinatura cancelada suspende a empresa', async () => {
    const { db, send, api } = setup();
    await send('hook_1', 'subscription.created');
    api.mockResolvedValueOnce(subscription({ status: 'canceled', canceled_at: '2026-12-20T10:00:00Z' }));
    await send('hook_2', 'subscription.canceled');
    expect(db.t.billing_subscriptions[0]).toMatchObject({ status: 'canceled', canceled_at: '2026-12-20T10:00:00Z' });
    expect(db.t.organizations[0]!.status).toBe('suspended');
  });

  it('cancelamento atrasado de uma assinatura antiga não derruba a assinatura nova', async () => {
    const { db, send, api } = setup();
    await send('hook_1', 'subscription.created');
    api.mockResolvedValueOnce(subscription({ id: 'sub_old', status: 'canceled' }));
    const result = await send('hook_2', 'subscription.canceled', { id: 'sub_old' });
    expect(result.body).toMatchObject({ reason: 'stale_subscription' });
    expect(db.t.organizations[0]!.status).toBe('active');
    expect(db.t.billing_subscriptions[0]!.provider_subscription_id).toBe('sub_abc');
  });

  it('ignora eventos sem assinatura (ex.: pedido avulso) e corpo inválido', async () => {
    const { api, send } = setup();
    expect((await send('hook_9', 'order.paid', { id: 'or_1' })).body).toMatchObject({ ignored: true });
    expect(api).not.toHaveBeenCalled();
    const { db } = setup();
    expect((await processPagarmeEvent(db as any, api as any, null)).status).toBe(400);
  });

  it('assinatura sem empresa vinculada não mexe em nada', async () => {
    const { db, send } = setup(subscription({ customer: { id: 'cus_x', code: 'outro-sistema' } }));
    expect((await send('hook_1', 'subscription.created')).body).toMatchObject({ reason: 'subscription_without_organization' });
    expect(db.t.billing_subscriptions).toHaveLength(0);
    expect(db.t.organizations[0]!.status).toBe('trial');
  });
});

describe('funções de cobrança', () => {
  it('extractSubscriptionId nos formatos de assinatura, fatura e cobrança', () => {
    expect(extractSubscriptionId('subscription.created', { id: 'sub_1' })).toBe('sub_1');
    expect(extractSubscriptionId('invoice.paid', { id: 'in_1', subscription_id: 'sub_2' })).toBe('sub_2');
    expect(extractSubscriptionId('charge.paid', { id: 'ch_1', invoice: { subscription_id: 'sub_3' } })).toBe('sub_3');
    expect(extractSubscriptionId('charge.paid', { id: 'ch_1', invoice: { subscription: { id: 'sub_4' } } })).toBe('sub_4');
    expect(extractSubscriptionId('order.paid', { id: 'or_1' })).toBeNull();
  });

  it('nextBillingStatus', () => {
    expect(nextBillingStatus('active', 'subscription.created', null)).toBe('active');
    expect(nextBillingStatus('future', 'subscription.created', null)).toBe('active');
    expect(nextBillingStatus('active', 'invoice.payment_failed', 'active')).toBe('past_due');
    expect(nextBillingStatus('canceled', 'charge.paid', 'active')).toBe('canceled');
  });

  it('readSubscription ignora customer.code que não é id de empresa', () => {
    expect(readSubscription(subscription({ customer: { code: 'abc' } })).organizationId).toBeNull();
    expect(readSubscription(subscription()).organizationId).toBe(ORG);
  });

  it('payload do checkout: assinatura no cartão, vinculada à empresa e com retorno ao Tendi', () => {
    const body = buildCheckoutPayload({ organizationId: ORG, organizationName: 'Clínica', planName: 'Tendi Start', pagarmePlanId: 'plan_start', customerName: 'Ana', customerEmail: 'ana@exemplo.com', successUrl: 'https://app/assinatura' });
    expect(body).toMatchObject({
      type: 'subscription',
      payment_settings: { accepted_payment_methods: ['credit_card'] },
      cart_settings: { recurrences: [{ plan_id: 'plan_start' }] },
      customer_settings: { customer: { code: ORG, email: 'ana@exemplo.com' } },
      flow_settings: { success_url: 'https://app/assinatura' },
    });
  });

  it('payload do plano: mensal, cartão, preço em centavos', () => {
    expect(buildPlanPayload({ code: 'tendi_pro', name: 'Tendi Pro' }, toCents(397.9))).toMatchObject({
      interval: 'month', interval_count: 1, payment_methods: ['credit_card'], items: [{ pricing_scheme: { price: 39790 } }],
    });
  });

  it('chave secreta e ambiente', () => {
    expect(validateSecretKey('pk_abcdefghijklmnop')).toMatch(/pública/);
    expect(validateSecretKey('sk_test_abcdefghijklmnop')).toBeNull();
    expect(pagarmeBaseUrl('sk_test_x')).toContain('sdx-api');
    expect(pagarmeBaseUrl('sk_live')).toBe('https://api.pagar.me/core/v5');
  });
});

describe('bloqueio de acesso', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  it('empresa suspensa ou com teste vencido fica bloqueada; ativa libera', () => {
    expect(isOrganizationBlocked({ status: 'suspended' }, now)).toBe(true);
    expect(isOrganizationBlocked({ status: 'trial', trial_ends_at: '2026-11-01T00:00:00Z' }, now)).toBe(true);
    expect(isOrganizationBlocked({ status: 'active' }, now)).toBe(false);
    expect(shouldBlockAccess([{ status: 'suspended' }, { status: 'active' }], now)).toBe(false);
    expect(shouldBlockAccess([{ status: 'suspended' }], now)).toBe(true);
    expect(shouldBlockAccess([], now)).toBe(false);
  });
});
