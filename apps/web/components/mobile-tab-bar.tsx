'use client';

import { CalendarDays, Inbox, KanbanSquare, Menu, Users } from 'lucide-react';
import { withOrganization } from '@/lib/current-organization';
import { canAccessArea, type Area, type Role } from '@/lib/team';

const TABS: Array<{ label: string; href: string; icon: typeof Inbox; area: Area }> = [
  { label: 'Inbox', href: '/inbox', icon: Inbox, area: 'inbox' },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays, area: 'agenda' },
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
  const item = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold transition active:scale-95';
  return <nav aria-label="Navegação principal" className={`${fixed ? 'fixed inset-x-0 bottom-0 z-30' : 'shrink-0'} border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden ${className}`}>
    <div className="mx-auto flex max-w-xl">
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <a key={href} href={withOrganization(href, organizationId)} aria-current={active ? 'page' : undefined} className={`${item} ${active ? 'text-[#2F316B]' : 'text-slate-400'}`}>
          <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition ${active ? 'bg-[#F0F0FA]' : ''}`}>
            <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
            {href === '/inbox' && Boolean(badge) && <span className="absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-[#CB0A9F] px-1 text-center text-[10px] font-bold leading-[18px] text-white">{badge! > 99 ? '99+' : badge}</span>}
          </span>
          {label}
        </a>;
      })}
      <button type="button" onClick={onMenu} className={`${item} text-slate-400`}>
        <span className="flex h-8 w-14 items-center justify-center rounded-full"><Menu size={21} strokeWidth={1.9} /></span>
        Menu
      </button>
    </div>
  </nav>;
}
