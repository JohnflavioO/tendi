import type { Role } from './team';

/**
 * Memória do workspace na aba do navegador: empresa atual, empresas da pessoa e papel.
 * Trocar de tela não consulta o banco de novo; os dados são atualizados em segundo plano
 * quando passam de FRESH_MS. Fica só nesta aba (sessionStorage) e some ao sair da conta.
 * Não guarda nada sensível: ids, nomes e o papel (a segurança dos dados continua no banco, via RLS).
 */

export type WorkspaceOrg = { id: string; name: string; status?: string | null; trial_ends_at?: string | null; complimentary_since?: string | null; complimentary_until?: string | null };
export type WorkspaceSnapshot = {
  userId: string;
  organization: WorkspaceOrg | null;
  organizations: Array<{ id: string; name: string }>;
  role: Role | null;
  superAdmin: boolean;
  supportUntil: string | null;
  /** Quando o papel acima foi confirmado no banco (sem isso, role null não significa "sem acesso"). */
  roleCheckedAt?: number;
  savedAt: number;
};

const KEY = 'tendidesk_workspace_v1';
/** Até aqui os dados valem sem atualizar. */
export const FRESH_MS = 60_000;
/** Depois disso a memória é descartada (a tela carrega do zero). */
export const MAX_AGE_MS = 5 * 60_000;

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
let memory: WorkspaceSnapshot | null = null;

function sessionStore(): Store | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** Memória válida para a empresa pedida (ou qualquer uma, se nenhuma foi pedida). */
export function readWorkspace(requestedOrgId?: string | null, now = Date.now(), store: Store | null = sessionStore()): WorkspaceSnapshot | null {
  let snapshot = memory;
  if (!snapshot && store) {
    try { snapshot = JSON.parse(store.getItem(KEY) || 'null') as WorkspaceSnapshot | null; } catch { snapshot = null; }
  }
  if (!snapshot || typeof snapshot.savedAt !== 'number' || now - snapshot.savedAt > MAX_AGE_MS) return null;
  if (requestedOrgId && snapshot.organization?.id !== requestedOrgId) return null;
  memory = snapshot;
  return snapshot;
}

/**
 * Só a memória já carregada nesta página (sem ler o sessionStorage). Usada no primeiro desenho:
 * numa recarga completa ela está vazia, igual ao que o servidor desenhou (evita diferença na hidratação);
 * nas trocas de tela pelo menu ela já está preenchida e a tela aparece na hora.
 */
export function peekWorkspace(requestedOrgId?: string | null, now = Date.now()): WorkspaceSnapshot | null {
  return memory ? readWorkspace(requestedOrgId, now, null) : null;
}

export function isFresh(snapshot: WorkspaceSnapshot | null, now = Date.now()): boolean {
  return Boolean(snapshot) && now - snapshot!.savedAt < FRESH_MS;
}

export function writeWorkspace(snapshot: Omit<WorkspaceSnapshot, 'savedAt'>, now = Date.now(), store: Store | null = sessionStore()): WorkspaceSnapshot {
  memory = { ...snapshot, savedAt: now };
  try { store?.setItem(KEY, JSON.stringify(memory)); } catch { /* sem sessionStorage: fica só na memória */ }
  return memory;
}

/** Atualiza só parte da memória (ex.: o papel chegou depois da empresa). */
export function patchWorkspace(patch: Partial<Omit<WorkspaceSnapshot, 'savedAt'>>, now = Date.now(), store: Store | null = sessionStore()): void {
  if (!memory) return;
  writeWorkspace({ ...memory, ...patch }, now, store);
}

/** Ao sair da conta ou trocar de usuário. */
export function clearWorkspace(store: Store | null = sessionStore()): void {
  memory = null;
  try { store?.removeItem(KEY); } catch { /* nada a limpar */ }
}
