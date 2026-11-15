import { describe, expect, it } from 'vitest';
import {
  complimentaryDaysLeft, complimentaryLabel, grantComplimentaryPatch, isChargingSubscription, isComplimentaryActive,
  isComplimentaryExpired, parseComplimentaryInput, revokeComplimentaryPatch, statusAfterComplimentaryRevoked,
} from './complimentary';
import { monthlyRevenue, organizationSituation, ATTENTION_SITUATIONS } from './company-control';
import { planStatus } from './plan-status';
import { isOrganizationBlocked, shouldBlockAccess } from './trial';

const now = new Date('2026-11-15T15:00:00Z');
const since = '2026-11-01T12:00:00Z';
const ADMIN = '22222222-2222-4222-8222-222222222222';

describe('conta cortesia: regras', () => {
  it('sem prazo vale até ser revogada; com prazo, até a data', () => {
    expect(isComplimentaryActive({ complimentary_since: since }, now)).toBe(true);
    expect(isComplimentaryActive({ complimentary_since: since, complimentary_until: '2026-12-01T02:59:59Z' }, now)).toBe(true);
    expect(isComplimentaryActive({ complimentary_since: since, complimentary_until: '2026-11-10T02:59:59Z' }, now)).toBe(false);
    expect(isComplimentaryExpired({ complimentary_since: since, complimentary_until: '2026-11-10T02:59:59Z' }, now)).toBe(true);
    expect(isComplimentaryActive({}, now)).toBe(false);
    expect(isComplimentaryExpired({ complimentary_until: '2026-11-10T02:59:59Z' }, now)).toBe(false);
    expect(isComplimentaryActive(null, now)).toBe(false);
  });

  it('mostra o selo com os dias restantes', () => {
    expect(complimentaryLabel({ complimentary_since: since }, now)).toBe('Cortesia');
    expect(complimentaryDaysLeft({ complimentary_since: since, complimentary_until: '2026-11-17T15:00:00Z' }, now)).toBe(2);
    expect(complimentaryLabel({ complimentary_since: since, complimentary_until: '2026-11-17T15:00:00Z' }, now)).toBe('Cortesia · 2 dias');
    expect(complimentaryLabel({ complimentary_since: since, complimentary_until: '2026-11-16T10:00:00Z' }, now)).toBe('Cortesia · 1 dia');
    expect(complimentaryLabel({ complimentary_since: since, complimentary_until: '2026-11-01T00:00:00Z' }, now)).toBe('Cortesia vencida');
  });

  it('valida o pedido: plano, motivo e prazo (fim do dia em Brasília)', () => {
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro de implantação' }, now))
      .toEqual({ ok: true, value: { planCode: 'tendi_pro', until: null, reason: 'Parceiro de implantação' } });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: '  Permuta   agência ', until: '2026-12-31' }, now))
      .toEqual({ ok: true, value: { planCode: 'tendi_pro', until: '2027-01-01T02:59:59.000Z', reason: 'Permuta agência' } });
    // Hoje ainda vale (até 23:59 de Brasília).
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro', until: '2026-11-15' }, now).ok).toBe(true);
    expect(parseComplimentaryInput({ planCode: '', reason: 'Parceiro' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'x' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'a'.repeat(301) }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro', until: '2026-11-14' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro', until: '2027-02-31' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro', until: '15/12/2026' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput({ planCode: 'tendi_pro', reason: 'Parceiro', until: '2035-01-01' }, now)).toMatchObject({ ok: false });
    expect(parseComplimentaryInput(null, now)).toMatchObject({ ok: false });
  });

  it('liberar deixa a empresa ativa no plano escolhido; alterar mantém a data de início', () => {
    const input = { planCode: 'tendi_pro', until: null, reason: 'Parceiro' };
    expect(grantComplimentaryPatch(input, {}, ADMIN, now)).toEqual({
      status: 'active', plan_code: 'tendi_pro', complimentary_since: now.toISOString(), complimentary_until: null,
      complimentary_reason: 'Parceiro', complimentary_by: ADMIN,
    });
    expect(grantComplimentaryPatch(input, { complimentary_since: since }, ADMIN, now).complimentary_since).toBe(since);
    // Cortesia vencida liberada de novo começa agora.
    expect(grantComplimentaryPatch(input, { complimentary_since: since, complimentary_until: '2026-11-02T00:00:00Z' }, ADMIN, now).complimentary_since).toBe(now.toISOString());
  });

  it('revogar volta ao fluxo normal', () => {
    expect(statusAfterComplimentaryRevoked({ trialEndsAt: null, hasActiveSubscription: true }, now)).toEqual({ status: 'active', trialEndsAt: null });
    expect(statusAfterComplimentaryRevoked({ trialEndsAt: '2026-11-20T00:00:00Z', hasActiveSubscription: false }, now)).toEqual({ status: 'trial', trialEndsAt: '2026-11-20T00:00:00Z' });
    // Sem assinatura e sem teste: teste encerrado agora (a empresa vê a tela de assinatura).
    expect(statusAfterComplimentaryRevoked({ trialEndsAt: '2026-11-01T00:00:00Z', hasActiveSubscription: false }, now)).toEqual({ status: 'trial', trialEndsAt: now.toISOString() });
    const patch = revokeComplimentaryPatch({ trialEndsAt: null, hasActiveSubscription: false }, now);
    expect(patch).toMatchObject({ status: 'trial', complimentary_since: null, complimentary_until: null, complimentary_reason: null, complimentary_by: null });
    expect(isOrganizationBlocked(patch, new Date(now.getTime() + 1000))).toBe(true);
  });

  it('só bloqueia a cortesia quando há assinatura cobrando', () => {
    expect(isChargingSubscription('active')).toBe(true);
    expect(isChargingSubscription('past_due')).toBe(true);
    expect(isChargingSubscription('canceled')).toBe(false);
    expect(isChargingSubscription(null)).toBe(false);
  });
});

describe('conta cortesia: acesso', () => {
  it('cortesia valendo libera mesmo com teste vencido no passado; vencida bloqueia', () => {
    const base = { status: 'active', trial_ends_at: '2026-11-01T00:00:00Z' };
    expect(isOrganizationBlocked({ ...base, complimentary_since: since }, now)).toBe(false);
    expect(isOrganizationBlocked({ ...base, complimentary_since: since, complimentary_until: '2026-11-14T00:00:00Z' }, now)).toBe(true);
    expect(shouldBlockAccess([{ ...base, complimentary_since: since, complimentary_until: '2026-11-14T00:00:00Z' }], now)).toBe(true);
    expect(isOrganizationBlocked({ status: 'suspended', complimentary_since: since }, now)).toBe(true);
  });

  it('o cliente vê "Conta cortesia" em vez de pagamento pendente', () => {
    expect(planStatus({ status: 'active', subscriptionStatus: 'past_due', complimentarySince: since, now })).toMatchObject({ label: 'Conta cortesia', tone: 'ok' });
    expect(planStatus({ status: 'active', complimentarySince: since, complimentaryUntil: '2026-11-18T15:00:00Z', now }).detail).toContain('Faltam 3 dias');
    expect(planStatus({ status: 'active', complimentarySince: since, complimentaryUntil: '2026-11-14T00:00:00Z', now })).toMatchObject({ label: 'Cortesia encerrada', tone: 'blocked' });
    expect(planStatus({ status: 'active', subscriptionStatus: 'active', complimentarySince: since, complimentaryUntil: '2026-11-14T00:00:00Z', now })).toMatchObject({ label: 'Assinatura ativa' });
  });
});

describe('conta cortesia no Console', () => {
  const org = { status: 'active', trial_ends_at: null };

  it('aparece com selo próprio, fora de pagantes e de atenção', () => {
    const situation = organizationSituation({ ...org, complimentary_since: since }, { status: 'past_due' }, now);
    expect(situation).toMatchObject({ key: 'complimentary', label: 'Cortesia' });
    expect(ATTENTION_SITUATIONS).not.toContain(situation.key);
    expect(monthlyRevenue(situation, { status: 'active', billing_period: 'monthly' }, { monthly_price: 289 })).toBe(0);
  });

  it('cortesia vencida sem assinatura pede atenção; com assinatura é pagante', () => {
    const expired = { ...org, complimentary_since: since, complimentary_until: '2026-11-14T00:00:00Z' };
    expect(organizationSituation(expired, null, now)).toMatchObject({ key: 'expired', label: 'Cortesia vencida' });
    expect(organizationSituation(expired, { status: 'active' }, now).key).toBe('paying');
  });

  it('mantém as situações de antes', () => {
    expect(organizationSituation(org, { status: 'active' }, now).key).toBe('paying');
    expect(monthlyRevenue({ key: 'paying', label: '', tone: '' }, { status: 'active', billing_period: 'annual' }, { monthly_price: 289, annual_price: 2400 })).toBe(200);
    expect(organizationSituation({ status: 'trial', trial_ends_at: '2026-11-20T15:00:00Z' }, null, now)).toMatchObject({ key: 'trial', label: 'Teste · 5 dias' });
    expect(organizationSituation({ status: 'trial', trial_ends_at: '2026-11-10T00:00:00Z' }, null, now)).toMatchObject({ key: 'expired', label: 'Teste vencido' });
    expect(organizationSituation({ status: 'suspended', trial_ends_at: null, complimentary_since: since }, null, now).key).toBe('suspended');
    expect(organizationSituation(org, null, now).key).toBe('no_subscription');
  });
});
