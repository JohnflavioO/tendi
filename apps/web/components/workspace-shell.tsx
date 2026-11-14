'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SidebarFooter } from '@/components/sidebar-footer';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { requestedOrganizationId, resolveCurrentOrganization, withOrganization } from '@/lib/current-organization';
import { SupportBanner } from '@/components/support-banner';
import { BrandLoader } from '@/components/brand-loader';
import { areaForPath, canAccessArea, type Area } from '@/lib/team';
import {
  Inbox, CalendarDays, KanbanSquare, Users, Plug, ChartNoAxesCombined, Settings, ChevronDown,
  MoreHorizontal, UserRound, RefreshCw, CircleHelp, LogOut, Building2, Menu, X, UsersRound, Sparkles,
} from 'lucide-react';

export const WORKSPACE_NAV: Array<{ label: string; href: string; icon: typeof Inbox; area: Area }> = [
  { label: 'Inbox', href: '/inbox', icon: Inbox, area: 'inbox' },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays, area: 'agenda' },
  { label: 'CRM', href: '/crm', icon: KanbanSquare, area: 'crm' },
  { label: 'Contatos', href: '/contatos', icon: Users, area: 'contatos' },
  { label: 'Conexões', href: '/chatbots', icon: Plug, area: 'chatbots' },
  { label: 'Agente de IA', href: '/ia', icon: Sparkles, area: 'ia' },
  { label: 'Relatórios', href: '/relatorios', icon: ChartNoAxesCombined, area: 'relatorios' },
  { label: 'Equipe', href: '/equipe', icon: UsersRound, area: 'equipe' },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, area: 'configuracoes' },
];

export function WorkspaceShell({ children, title, description, actions }: {
  children: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createClient() as any;
  const [organization, setOrganization] = useState<{id:string;name:string}|null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      // A empresa pedida no endereço; senão, a primeira em que a pessoa trabalha (vínculo ou suporte liberado).
      const current = await resolveCurrentOrganization<{id:string;name:string}>(supabase, auth.user.id, 'id,name', requestedOrganizationId()).catch(() => null);
      if (!active) return;
      if (current?.organization) setOrganization(current.organization);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  const { role, superAdmin, supportUntil } = useWorkspaceRole(organization?.id);
  const navigation = WORKSPACE_NAV.filter(item => role === undefined ? false : canAccessArea(role, superAdmin, item.area));
  // Página fora do papel da pessoa (ex.: atendente abrindo /configuracoes pelo link): volta para o Inbox.
  // Super Admin sem vínculo com a empresa não abre áreas de atendimento: volta para o Console.
  const area = areaForPath(pathname);
  const blocked = role !== undefined && area !== null && !canAccessArea(role, superAdmin, area);
  const consoleOnly = superAdmin && !role;
  useEffect(() => { if (blocked) window.location.replace(consoleOnly ? '/admin' : '/inbox'); }, [blocked, consoleOnly]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  const sidebar = <aside className="flex h-full w-[238px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
    <a href={consoleOnly ? '/admin' : withOrganization('/inbox', organization?.id)} className="mb-8 flex items-center px-2"><img src="/brand/Logo%20Tendi.png" alt="Tendi" className="h-9 w-auto object-contain"/></a>
    <div className="mb-6 rounded-xl border border-slate-200 bg-[#FAFBFD] p-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</span>
      <div className="flex items-center gap-2 text-sm font-semibold text-[#2F316B]"><Building2 size={16}/><span className="truncate">{organization?.name ?? 'Carregando...'}</span><ChevronDown size={14} className="ml-auto text-slate-400"/></div>
    </div>
    <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
    <nav className="space-y-1">{navigation.map(({label,href,icon:Icon})=>{
      const active = pathname === href || (href !== '/inbox' && pathname.startsWith(href + '/'));
      return <a key={href} href={withOrganization(href, organization?.id)} onClick={()=>setMobileOpen(false)} className={active ? 'flex items-center gap-3 rounded-xl bg-[#F0F0FA] px-3 py-3 text-sm font-semibold text-[#2F316B]' : 'flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-[#2F316B]'}><Icon size={18}/>{label}</a>;
    })}</nav>
    <SidebarFooter organizationId={organization?.id} role={role} superAdmin={superAdmin} onSignOut={signOut}/>
  </aside>;

  if (loading || blocked) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] text-[#2F316B]"><BrandLoader label="Carregando workspace..." size={56} /></main>;
  if (!organization) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto text-[#CB0A9F]" size={30}/><h1 className="mt-3 font-bold text-[#2F316B]">Workspace não encontrado</h1><p className="mt-2 text-sm text-slate-500">Sua conta não possui uma empresa ativa vinculada.</p></div></main>;

  return <main className="flex min-h-screen bg-[#F5F6FB] text-slate-800">
    <div className="hidden lg:flex">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-40 flex lg:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/30" onClick={()=>setMobileOpen(false)}/><div className="relative z-10">{sidebar}<button onClick={()=>setMobileOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 text-slate-500"><X size={18}/></button></div></div>}
    <section className="flex min-w-0 flex-1 flex-col">
      <SupportBanner organizationId={organization.id} organizationName={organization.name} supportUntil={supportUntil}/>
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3"><button onClick={()=>setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Abrir menu"><Menu size={19}/></button><div className="min-w-0"><p className="truncate text-lg font-bold tracking-tight text-[#25275B]">{title}</p><p className="hidden truncate text-xs text-slate-400 sm:block">{description}</p></div></div>
        <div className="relative flex items-center gap-2">{actions}<button onClick={()=>setMenuOpen(!menuOpen)} aria-label="Abrir menu de opções" aria-expanded={menuOpen} className={menuOpen?'rounded-xl bg-[#F0F0FA] p-2.5 text-[#2F316B]':'rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#2F316B]'}><MoreHorizontal size={20}/></button>
          {menuOpen&&<><button aria-label="Fechar menu" className="fixed inset-0 z-20 cursor-default" onClick={()=>setMenuOpen(false)}/><div className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"><div className="border-b border-slate-100 px-3 py-2"><p className="text-xs font-semibold text-[#2F316B]">{organization.name}</p><p className="text-[10px] text-slate-400">Opções do workspace</p></div>{canAccessArea(role, superAdmin, 'configuracoes')&&<a href="/configuracoes" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50"><UserRound size={15}/>Perfil e configurações</a>}<button onClick={()=>window.location.reload()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50"><RefreshCw size={15}/>Atualizar página</button><a href="mailto:suporte@tendidesk.com.br" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50"><CircleHelp size={15}/>Ajuda e suporte</a><button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs text-rose-600 hover:bg-rose-50"><LogOut size={15}/>Sair da conta</button></div></>}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1600px] flex-1 p-5 md:p-8">{children}</div>
    </section>
  </main>;
}
