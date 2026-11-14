import { describe, expect, it } from 'vitest';
import { editableBRL, formatBRL, parseBRL } from './money';

const plain = (text: string) => text.replace(/ /g, ' ');

describe('valores em reais', () => {
  it('entende o jeito que as pessoas digitam', () => {
    expect(parseBRL('289')).toBe(289);
    expect(parseBRL('R$ 2.400,50')).toBe(2400.5);
    expect(parseBRL('2400,5')).toBe(2400.5);
    expect(parseBRL('1.927,80')).toBe(1927.8);
    expect(parseBRL('289.90')).toBe(289.9);
    expect(parseBRL('300.000')).toBe(300000);
    expect(parseBRL('1.234.567')).toBe(1234567);
    expect(parseBRL('')).toBe(0);
  });

  it('recusa o que não é valor', () => {
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('-10')).toBeNull();
    expect(parseBRL('1,2,3')).toBeNull();
    expect(parseBRL('9999999999')).toBeNull();
  });

  it('mostra no padrão brasileiro', () => {
    expect(plain(formatBRL(2400.5))).toBe('R$ 2.400,50');
    expect(plain(formatBRL('289'))).toBe('R$ 289,00');
    expect(plain(formatBRL(null))).toBe('R$ 0,00');
    expect(editableBRL(2947.8)).toBe('2.947,80');
    expect(editableBRL(0)).toBe('');
  });
});
