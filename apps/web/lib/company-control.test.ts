import { describe, expect, it } from 'vitest';
import { confirmsDeletion, isInternalOrganization, statusAfterReactivation } from './company-control';

const now = new Date('2026-11-13T15:00:00Z');

describe('controle de empresas pelo Console', () => {
  it('reconhece o workspace interno da plataforma', () => {
    expect(isInternalOrganization({ slug: 'tendi' })).toBe(true);
    expect(isInternalOrganization({ slug: 'tendi-12ab34cd' })).toBe(false);
    expect(isInternalOrganization({ slug: 'studio-on' })).toBe(false);
    expect(isInternalOrganization(null)).toBe(false);
  });

  it('só confirma a exclusão com o nome exato da empresa', () => {
    expect(confirmsDeletion('Studio On', 'Studio On')).toBe(true);
    expect(confirmsDeletion('  studio on ', 'Studio On')).toBe(true);
    expect(confirmsDeletion('Studio', 'Studio On')).toBe(false);
    expect(confirmsDeletion('', 'Studio On')).toBe(false);
    expect(confirmsDeletion('   ', '   ')).toBe(false);
    expect(confirmsDeletion(undefined, 'Studio On')).toBe(false);
    expect(confirmsDeletion(123, '123')).toBe(false);
  });

  it('ao reativar, volta para teste só se o teste ainda vale e não há assinatura', () => {
    expect(statusAfterReactivation({ trialEndsAt: '2026-11-20T00:00:00Z', hasActiveSubscription: false }, now)).toBe('trial');
    expect(statusAfterReactivation({ trialEndsAt: '2026-11-20T00:00:00Z', hasActiveSubscription: true }, now)).toBe('active');
    expect(statusAfterReactivation({ trialEndsAt: '2026-11-01T00:00:00Z', hasActiveSubscription: false }, now)).toBe('active');
    expect(statusAfterReactivation({ trialEndsAt: null, hasActiveSubscription: false }, now)).toBe('active');
  });
});
