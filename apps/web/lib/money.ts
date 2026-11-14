/** Valores em reais digitados por pessoas ("R$ 2.400,50", "2400", "289,9") e exibidos no padrão brasileiro. */

export const MAX_AMOUNT = 999_999_999.99;

/**
 * Converte o que a pessoa digitou em número. Vírgula é o separador decimal; ponto, de milhar
 * (mas "289.90", com 1 ou 2 casas depois do ponto e sem vírgula, também vale como decimal).
 * Devolve null quando não dá para entender ou o valor é negativo/grande demais.
 */
export function parseBRL(input: string): number | null {
  const raw = input.replace(/R\$|\s/gi, '').trim();
  if (!raw) return 0;
  if (!/^[\d.,]+$/.test(raw)) return null;
  let normalized: string;
  if (raw.includes(',')) {
    if (raw.indexOf(',') !== raw.lastIndexOf(',')) return null;
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalized = raw;
  } else {
    normalized = raw.replace(/\./g, '');
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return null;
  return Math.round(value * 100) / 100;
}

/** "R$ 2.400,50" */
export function formatBRL(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  return (Number.isFinite(number) ? number : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valor para o campo de edição: "2.400,50" (vazio quando é zero). */
export function editableBRL(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number === 0) return '';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
