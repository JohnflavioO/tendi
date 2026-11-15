import { beforeEach, describe, expect, it } from 'vitest';
import { clearWorkspace, FRESH_MS, isFresh, MAX_AGE_MS, patchWorkspace, readWorkspace, writeWorkspace } from './workspace-cache';

function fakeStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

const base = {
  userId: 'u1',
  organization: { id: 'org-1', name: 'Tendi', status: 'active' },
  organizations: [{ id: 'org-1', name: 'Tendi' }, { id: 'org-2', name: 'Studio' }],
  role: 'owner' as const,
  superAdmin: true,
  supportUntil: null,
};

describe('memória do workspace entre telas', () => {
  let store: ReturnType<typeof fakeStore>;
  beforeEach(() => { store = fakeStore(); clearWorkspace(store); });

  it('guarda e devolve a empresa e o papel', () => {
    writeWorkspace(base, 1_000, store);
    expect(readWorkspace(null, 2_000, store)).toMatchObject({ organization: { id: 'org-1' }, role: 'owner' });
    expect(readWorkspace('org-1', 2_000, store)?.organization?.id).toBe('org-1');
  });

  it('outra empresa pedida no endereço não usa a memória', () => {
    writeWorkspace(base, 1_000, store);
    expect(readWorkspace('org-2', 2_000, store)).toBeNull();
  });

  it('fresca por 1 minuto; descartada depois de 5', () => {
    const saved = writeWorkspace(base, 0, store);
    expect(isFresh(saved, FRESH_MS - 1)).toBe(true);
    expect(isFresh(saved, FRESH_MS + 1)).toBe(false);
    expect(readWorkspace(null, MAX_AGE_MS + 1, store)).toBeNull();
  });

  it('atualiza parte e limpa ao sair', () => {
    writeWorkspace({ ...base, role: null }, 0, store);
    patchWorkspace({ role: 'agent' }, 10, store);
    expect(readWorkspace(null, 20, store)?.role).toBe('agent');
    clearWorkspace(store);
    expect(readWorkspace(null, 30, store)).toBeNull();
    expect(store.data.size).toBe(0);
  });
});
