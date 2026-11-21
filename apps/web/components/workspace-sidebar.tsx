'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChevronsUpDown, X, type LucideIcon } from 'lucide-react';
import { SidebarFooter } from '@/components/sidebar-footer';
import type { Area, Role } from '@/lib/team';
import type { PlanBadge } from '@/lib/complimentary';

export type SidebarItem = { label: string; href: string; icon: LucideIcon; area: Area; active: boolean; badge?: number };

const initials = (name?: string | null) => (name || 'T').split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();

/**
 * Menu lateral do workspace (usado pelo WorkspaceShell e pelo Inbox, que tem layout próprio).
 * Fundo escuro com a marca, seletor de empresa, navegação com `data-tour` para o guia de primeiros passos e rodapé da conta.
 */
export function WorkspaceSidebar({ homeHref, organizationId, organizationName, planBadge, organizations, onSwitch, items, role, superAdmin, onSignOut, onNavigate, onClose }: {
  homeHref: string;
  organizationId?: string | null;
  organizationName?: string | null;
  /** Plano da empresa, ao lado da logo (ex.: "Pro", "Start · teste"). */
  planBadge?: PlanBadge | null;
  /** Empresas em que a pessoa trabalha; com mais de uma, o cartão vira um seletor. */
  organizations?: Array<{ id: string; name: string }>;
  onSwitch?: (id: string) => void;
  items: SidebarItem[];
  role?: Role | null;
  superAdmin?: boolean;
  onSignOut?: () => void;
  onNavigate?: () => void;
  /** Celular: mostra o botão de fechar a gaveta. */
  onClose?: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!organizationId) { setLogoUrl(null); return; }
    let active = true;
    void createClient().from('organizations').select('logo_url').eq('id', organizationId).maybeSingle()
      .then(({ data }) => { if (active) setLogoUrl((data as { logo_url?: string | null } | null)?.logo_url ?? null); });
    return () => { active = false; };
  }, [organizationId]);
  const canSwitch = Boolean(onSwitch && organizations && organizations.length > 1);
  const orgCard = <div className="flex items-center gap-3 rounded-xl bg-white/[.06] p-2.5 pr-3 ring-1 ring-inset ring-white/10 transition group-hover:bg-white/[.09]">
    {logoUrl ? <img src={logoUrl} alt="Logo da empresa" className="size-9 shrink-0 rounded-lg object-cover" /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-tendi-magenta to-tendi-lilac text-[12px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(203,10,159,.6)]">{initials(organizationName)}</span>}
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-[#8E91C4]">Empresa</span>
      <span className="block truncate text-[13.5px] font-semibold text-white">{organizationName ?? 'Carregando...'}</span>
    </span>
    {canSwitch && <ChevronsUpDown size={15} className="shrink-0 text-[#8E91C4]" />}
  </div>;

  return <aside className="td-sidebar relative flex h-full w-[256px] shrink-0 flex-col overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+20px)] text-white lg:pt-5">
    <div className="mb-6 flex items-center justify-between px-3">
      <Link href={homeHref} className="flex min-w-0 items-center gap-2.5 rounded-lg"><img src="/brand/tendidesk-logo-branca.png" alt="TendiDesk" width="1291" height="640" className="h-10 w-auto shrink-0 object-contain" />{planBadge && <span title="Plano da empresa" className={planBadge.tone === 'pro' ? 'whitespace-nowrap rounded-md bg-tendi-magenta/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.14em] text-[#F7A8E2] ring-1 ring-inset ring-tendi-magenta/30' : 'whitespace-nowrap rounded-md bg-white/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.14em] text-[#B9BBE0] ring-1 ring-inset ring-white/15'}>{planBadge.label}</span>}</Link>
      {onClose && <button type="button" onClick={onClose} aria-label="Fechar menu" className="rounded-lg p-2 text-[#B9BBE0] hover:bg-white/10 hover:text-white"><X size={18} /></button>}
    </div>

    {canSwitch
      ? <label className="group relative mb-6 block cursor-pointer">
          <span className="sr-only">Trocar de empresa</span>
          {orgCard}
          <select value={organizationId ?? ''} onChange={event => onSwitch!(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
            {organizations!.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
      : <div className="mb-6">{orgCard}</div>}

    <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#7275B0]">Menu</p>
    <nav aria-label="Menu do workspace" className="space-y-0.5">
      {items.map(({ label, href, icon: Icon, area, active, badge }) => <Link key={href} data-tour={`nav-${area}`} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`td-nav-item ${active ? 'td-nav-item-active' : ''}`}>
        <Icon size={18} strokeWidth={active ? 2.1 : 1.8} className={active ? 'text-white' : 'text-[#8E91C4]'} />
        <span className="truncate">{label}</span>
        {Boolean(badge) && <span className="ml-auto min-w-[22px] rounded-full bg-tendi-magenta px-1.5 text-center text-[10.5px] font-bold leading-5 text-white shadow-[0_2px_8px_-2px_rgba(203,10,159,.7)]">{badge! > 99 ? '99+' : badge}</span>}
      </Link>)}
    </nav>

    <SidebarFooter organizationId={organizationId} role={role} superAdmin={superAdmin} onSignOut={onSignOut} />
  </aside>;
}
