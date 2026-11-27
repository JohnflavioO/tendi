'use client';

import Link from 'next/link';
import { CalendarDays, Inbox, KanbanSquare, Menu, Users } from 'lucide-react';
import { withOrganization } from '@/lib/current-organization';
import { canAccessArea, type Area, type Role } from '@/lib/team';

const TABS: Array<{ label: string; href: string; icon: typeof Inbox; area: Area }> = [
  { label: 'Inbox', href: '/inbox', icon: Inbox, area: 'inbox' },
  { label: 'Agendar', href: '/agenda', icon: CalendarDays, area: 'agenda' },
  { label: 'CRM', href: '/crm', icon: KanbanSquare, area: 'crm' },
  { label: 'Contatos', href: '/contatos', icon: Users, area: 'contatos' },
];

/**
 * Barra inferior do celular/tablet, como nos apps nativos: as áreas do dia a dia a um toque
 * e "Menu" para o resto (Conexões, IA, Equipe, Configurações, conta).
 * `fixed`: presa ao rodapé da tela (páginas com rolagem). Sem ela, fica no fluxo (Inbox, que ocupa a tela toda).
 */
export function MobileTabBar({ pathname, organizationId, role, superAdmin, onMenu, badge, fixed = false, className = '' }: {
  pathname: string;
  organizationId?: string | null;
  role?: Role | null;
  superAdmin?: boolean;
  onMenu: () => void;
  badge?: number;
  fixed?: boolean;
  className?: string;
}) {
  const tabs = TABS.filter(tab => role !== undefined && canAccessArea(role, Boolean(superAdmin), tab.area));
  const item = 'group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2 text-[11px] font-semibold tracking-tight transition active:scale-95';
  return <nav aria-label="Navegação principal" className={`${fixed ? 'fixed inset-x-0 bottom-0 z-30' : 'shrink-0'} border-t border-tendi-line/80 bg-white/95 pb-[max(env(safe-area-inset-bottom),4px)] shadow-[0_-8px_24px_-16px_rgba(20,22,58,.25)] backdrop-blur-xl backdrop-saturate-150 lg:hidden ${className}`}>
    <div className="mx-auto flex max-w-xl gap-0.5 px-2">
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={withOrganization(href, organizationId)} aria-current={active ? 'page' : undefined} className={`${item} min-h-[56px] rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tendi-indigo ${active ? 'text-tendi-navy' : 'text-slate-500'}`}>
          <span className={`relative flex h-9 w-14 items-center justify-center rounded-2xl transition duration-200 ${active ? 'bg-tendi-mist text-tendi-indigo' : 'group-hover:text-tendi-indigo'}`}>
            <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
            {href === '/inbox' && Boolean(badge) && <span className="absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-tendi-magenta px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">{badge! > 99 ? '99+' : badge}</span>}
          </span>
          {label}
        </Link>;
      })}
      <button type="button" onClick={onMenu} className={`${item} min-h-[56px] rounded-xl text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tendi-indigo`}>
        <span className="flex h-8 w-14 items-center justify-center rounded-full transition group-hover:text-tendi-indigo"><Menu size={20} strokeWidth={1.9} /></span>
        Menu
      </button>
    </div>
  </nav>;
}
