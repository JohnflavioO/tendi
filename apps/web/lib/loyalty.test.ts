import { describe, expect, it } from 'vitest';
import { normalizeLoyaltySettings } from './loyalty';

describe('normalizeLoyaltySettings', () => {
  it('cai no padrão (desligado, 10 pontos) para valor vazio ou inválido', () => {
    expect(normalizeLoyaltySettings(null)).toEqual({ enabled: false, pointsPerVisit: 10 });
    expect(normalizeLoyaltySettings({ loyalty: { enabled: true, pointsPerVisit: 7 } }))
      .toEqual({ enabled: true, pointsPerVisit: 10 });
  });

  it('aceita um valor válido da lista', () => {
    expect(normalizeLoyaltySettings({ loyalty: { enabled: true, pointsPerVisit: 50 } }))
      .toEqual({ enabled: true, pointsPerVisit: 50 });
  });
});
