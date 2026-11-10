import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRIAL_DAYS, isTrialExemptPath, isTrialExpired, normalizeTrialDays,
  shouldBlockForExpiredTrial, trialDaysLabel, trialDaysLeft,
} from './trial';

const now = new Date('2026-11-10T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

describe('prazo do teste gratuito', () => {
  it('usa 7 dias como padrão', () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(7);
  });

  it.each([[7, 7], ['10', 10], [14.9, 14], [0, 7], [-3, 7], ['abc', 7], [null, 7], [undefined, 7], [99999, 7]])(
    'normaliza %s para %s', (input, expected) => {
      expect(normalizeTrialDays(input)).toBe(expected);
    });

  it('escreve singular e plural', () => {
    expect(trialDaysLabel(1)).toBe('1 dia');
    expect(trialDaysLabel(7)).toBe('7 dias');
  });
});

describe('dias restantes', () => {
  it('arredonda para cima enquanto o teste está valendo', () => {
    expect(trialDaysLeft({ status: 'trial', trial_ends_at: inDays(7) }, now)).toBe(7);
    expect(trialDaysLeft({ status: 'trial', trial_ends_at: inDays(0.2) }, now)).toBe(1);
  });

  it('retorna 0 depois do vencimento', () => {
    expect(trialDaysLeft({ status: 'trial', trial_ends_at: inDays(-2) }, now)).toBe(0);
  });

  it('retorna null para empresa ativa ou sem data', () => {
    expect(trialDaysLeft({ status: 'active', trial_ends_at: inDays(-2) }, now)).toBeNull();
    expect(trialDaysLeft({ status: 'trial', trial_ends_at: null }, now)).toBeNull();
    expect(trialDaysLeft({ status: 'trial', trial_ends_at: 'data-invalida' }, now)).toBeNull();
  });
});

describe('teste vencido', () => {
  it('vence somente com status trial e data no passado', () => {
    expect(isTrialExpired({ status: 'trial', trial_ends_at: inDays(-1) }, now)).toBe(true);
    expect(isTrialExpired({ status: 'trial', trial_ends_at: inDays(1) }, now)).toBe(false);
    expect(isTrialExpired({ status: 'active', trial_ends_at: inDays(-1) }, now)).toBe(false);
    expect(isTrialExpired({ status: 'trial', trial_ends_at: null }, now)).toBe(false);
  });

  it('bloqueia apenas quando todas as empresas visíveis estão vencidas', () => {
    const expired = { status: 'trial', trial_ends_at: inDays(-1) };
    const running = { status: 'trial', trial_ends_at: inDays(3) };
    const active = { status: 'active', trial_ends_at: null };
    expect(shouldBlockForExpiredTrial([expired], now)).toBe(true);
    expect(shouldBlockForExpiredTrial([expired, expired], now)).toBe(true);
    expect(shouldBlockForExpiredTrial([expired, active], now)).toBe(false);
    expect(shouldBlockForExpiredTrial([running], now)).toBe(false);
    expect(shouldBlockForExpiredTrial([], now)).toBe(false);
  });
});

describe('rotas liberadas com o teste vencido', () => {
  it.each(['/teste-encerrado', '/login', '/register', '/auth/signout', '/auth/callback', '/admin', '/admin/plans', '/api/admin/ai/status'])(
    'libera %s', path => {
      expect(isTrialExemptPath(path)).toBe(true);
    });

  it.each(['/inbox', '/crm', '/contatos', '/chatbots', '/configuracoes', '/api/inbox/send', '/api/whatsapp/connect', '/administrador'])(
    'não libera %s', path => {
      expect(isTrialExemptPath(path)).toBe(false);
    });
});
