import { describe, expect, it } from 'vitest';
import { isSoundEnabled, setSoundEnabled } from './notification-sound';

function fakeStore() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe('preferência de som de notificação', () => {
  it('vem ligado por padrão (sem preferência salva)', () => {
    expect(isSoundEnabled(fakeStore())).toBe(true);
    expect(isSoundEnabled(null)).toBe(true);
  });

  it('salva e respeita a escolha de desligar', () => {
    const store = fakeStore();
    setSoundEnabled(false, store);
    expect(isSoundEnabled(store)).toBe(false);
    setSoundEnabled(true, store);
    expect(isSoundEnabled(store)).toBe(true);
  });
});
