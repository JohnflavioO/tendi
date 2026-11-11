/** Funções de cobrança sem dependência de servidor (usadas também nas páginas). */

export type BillingPeriod = 'monthly' | 'annual';
export const isBillingPeriod = (value: unknown): value is BillingPeriod => value === 'monthly' || value === 'annual';

/** Desconto do anual em relação a 12 mensalidades, em % inteiro (ex.: 15). */
export function annualDiscountPercent(monthlyPrice: number | null, annualPrice: number | null): number | null {
  if (!monthlyPrice || !annualPrice) return null;
  const full = Number(monthlyPrice) * 12;
  const percent = Math.round(((full - Number(annualPrice)) / full) * 100);
  return percent > 0 ? percent : null;
}
