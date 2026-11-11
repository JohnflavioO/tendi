import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, estimateCostUsd, monthStartIso, normalizePricing, resolveMonthlyLimit, typicalReplyCostBrl, usageLevel } from './ai-limits';

describe('ai-limits', () => {
  it('início do mês em Brasília', () => {
    expect(monthStartIso(new Date('2026-11-13T15:00:00Z'))).toBe('2026-11-01T03:00:00.000Z');
    // 1º de dezembro às 01h UTC ainda é 30 de novembro em Brasília
    expect(monthStartIso(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11-01T03:00:00.000Z');
    expect(monthStartIso(new Date('2027-01-01T04:00:00Z'))).toBe('2027-01-01T03:00:00.000Z');
  });

  it('ordem do limite: exceção > plano > padrão; teste tem teto', () => {
    const settings = DEFAULT_LIMITS;
    expect(resolveMonthlyLimit({ planLimit: 1000, isTrial: false, settings })).toBe(1000);
    expect(resolveMonthlyLimit({ planLimit: null, isTrial: false, settings })).toBe(500);
    expect(resolveMonthlyLimit({ planLimit: 1000, isTrial: true, settings })).toBe(200);
    expect(resolveMonthlyLimit({ agentLimit: 5000, planLimit: 1000, isTrial: true, settings })).toBe(5000);
  });

  it('custo por modelo', () => {
    const pricing = normalizePricing(null);
    expect(estimateCostUsd(pricing, 'claude-haiku-5-5', 1_000_000, 1_000_000)).toBe(0.6);
    expect(estimateCostUsd(pricing, 'modelo-sem-preco', 1000, 1000)).toBe(0);
    expect(typicalReplyCostBrl(pricing, 'claude-haiku-5-5')).toBeCloseTo(0.006, 3);
    expect(typicalReplyCostBrl(pricing, 'claude-opus-5-5')).toBeCloseTo(0.242, 3);
  });

  it('normalizePricing ignora valores inválidos', () => {
    const pricing = normalizePricing({ usd_brl: 'x', models: { 'm': { input: -1, output: 2 }, 'ok': { input: 1, output: 2 } } });
    expect(pricing.usdBrl).toBe(5.5);
    expect(Object.keys(pricing.models)).toEqual(['ok']);
  });

  it('nível de uso', () => {
    expect(usageLevel(10, 100)).toBe('ok');
    expect(usageLevel(80, 100)).toBe('warning');
    expect(usageLevel(100, 100)).toBe('reached');
  });
});
