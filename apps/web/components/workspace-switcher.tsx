'use client';

import { useState } from 'react';
import { Check, ChevronDown, Search, Plus } from 'lucide-react';
import { switchWorkspaceSchema } from '@tendi/shared';
import { switchWorkspace } from '@/app/inbox/actions';

export type WorkspaceOption = {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'agent' | null;
  platformOnly: boolean;
};

type Props = {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  isSuperAdmin: boolean;
  returnTo?: string;
};

const brandColors = ['#2F316B', '#004751', '#CB0A9F'];
const roleLabels: Record<NonNullable<WorkspaceOption['role']>, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Supervisor',
  agent: 'Agente',
};

function avatarColor(id: string) {
  const hash = Array.from(id).reduce((value, char) => value + char.charCodeAt(0), 0);
  return brandColors[hash % brandColors.length];
}

export function WorkspaceSwitcher({ workspaces, activeWorkspaceId, isSuperAdmin, returnTo = '/inbox' }: Props) {
  const [search, setSearch] = useState('');
  const active = workspaces.find(item => item.id === activeWorkspaceId);
  const showSearch = isSuperAdmin || workspaces.length > 5;
  const filtered = workspaces.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <details className="group relative mb-6">
      <summary className="flex h-12 w-full cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#004751] [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: avatarColor(active?.id ?? 'tendi') }}>
          {(active?.name ?? 'T').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{active?.name ?? 'Selecionar workspace'}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
        <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Seus workspaces</p>
        {showSearch && (
          <label className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <Search size={14} className="text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar empresa..." className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
          </label>
        )}
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.map(item => (
            <form action={switchWorkspace} key={item.id} onSubmit={event => {
              const form = new FormData(event.currentTarget);
              const parsed = switchWorkspaceSchema.safeParse({ organizationId: form.get('organizationId'), returnTo: form.get('returnTo') });
              if (!parsed.success) event.preventDefault();
            }}>
              <input type="hidden" name="organizationId" value={item.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button type="submit" className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004751]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: avatarColor(item.id) }}>{item.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span>
                  <span className="block text-[10px] text-slate-400">{item.platformOnly ? 'Plataforma' : roleLabels[item.role ?? 'agent']}</span>
                </span>
                {item.id === activeWorkspaceId && <Check size={15} className="text-[#004751]" />}
              </button>
            </form>
          ))}
          {!filtered.length && <p className="px-3 py-5 text-center text-xs text-slate-400">Nenhum workspace encontrado.</p>}
        </div>
        {isSuperAdmin && (
          <a href="/admin" className="mt-2 flex items-center gap-2 border-t border-slate-100 px-2 pt-3 text-xs font-semibold text-[#2F316B] hover:text-[#004751]">
            <Plus size={15} /> Criar workspace
          </a>
        )}
      </div>
    </details>
  );
}
