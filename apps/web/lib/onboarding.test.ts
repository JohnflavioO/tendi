import { describe, expect, it } from 'vitest';
import { placePopover, shouldAutoStartTour, TOUR_DONE_KEY, tourStepsFor } from './onboarding';
import { planStatus } from './plan-status';

describe('guia de primeiros passos', () => {
  it('dono vê todos os passos; atendente só os do dia a dia', () => {
    expect(tourStepsFor('owner').map(step => step.id)).toEqual(['welcome', 'connect', 'ai', 'team', 'settings', 'inbox', 'crm', 'restart']);
    expect(tourStepsFor('manager').map(step => step.id)).not.toContain('ai');
    expect(tourStepsFor('agent').map(step => step.id)).toEqual(['welcome', 'inbox', 'crm', 'restart']);
  });

  it('abre sozinho só no primeiro acesso de quem tem papel na empresa', () => {
    expect(shouldAutoStartTour({}, 'owner')).toBe(true);
    expect(shouldAutoStartTour({ [TOUR_DONE_KEY]: '2026-11-14T10:00:00Z' }, 'owner')).toBe(false);
    expect(shouldAutoStartTour({}, null)).toBe(false);
    expect(shouldAutoStartTour(undefined, undefined)).toBe(false);
  });

  it('balão à direita do menu, embaixo quando não cabe, centralizado sem alvo', () => {
    const viewport = { width: 1280, height: 800 };
    const pop = { width: 340, height: 220 };
    const right = placePopover({ top: 200, left: 10, width: 200, height: 44 }, pop, viewport);
    expect(right).toMatchObject({ side: 'right', left: 224 });
    expect(right.top).toBeGreaterThanOrEqual(12);
    const bottom = placePopover({ top: 100, left: 1100, width: 160, height: 40 }, pop, viewport);
    expect(bottom.side).toBe('bottom');
    expect(bottom.left + pop.width).toBeLessThanOrEqual(viewport.width - 12);
    const top = placePopover({ top: 700, left: 1100, width: 160, height: 40 }, pop, viewport);
    expect(top.side).toBe('top');
    expect(placePopover(null, pop, viewport)).toMatchObject({ side: 'center', left: 470, top: 290 });
  });
});

describe('situação do plano em texto', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  it('teste grátis com dias restantes e encerrado', () => {
    expect(planStatus({ status: 'trial', trialEndsAt: '2026-11-17T12:00:00Z', now })).toMatchObject({ label: 'Teste grátis', detail: 'Faltam 3 dias.' });
    expect(planStatus({ status: 'trial', trialEndsAt: '2026-11-15T00:00:00Z', now }).detail).toBe('Faltam 1 dia.');
    expect(planStatus({ status: 'trial', trialEndsAt: '2026-11-10T12:00:00Z', now }).label).toBe('Teste encerrado');
  });
  it('assinatura ativa, pendente e conta suspensa', () => {
    expect(planStatus({ status: 'active', subscriptionStatus: 'active', billingPeriod: 'annual', now })).toMatchObject({ label: 'Assinatura ativa', detail: 'Cobrança anual no cartão de crédito.' });
    expect(planStatus({ status: 'active', subscriptionStatus: 'past_due', now }).tone).toBe('warning');
    expect(planStatus({ status: 'suspended', subscriptionStatus: 'active', now }).label).toBe('Acesso pausado');
  });
});
