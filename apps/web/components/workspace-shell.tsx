'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { requestedOrganizationId, resolveCurrentOrganization, withOrganization } from '@/lib/current-organization';
import { SupportBanner } from '@/components/support-banner';
import { BrandLoader } from '@/components/brand-loader';
import { OnboardingTour } from '@/components/onboarding-tour';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { WorkspaceSidebar } from '@/components/workspace-sidebar';
import { FullPageNotice } from '@/components/ui';
import { TOUR_EVENT } from '@/lib/onboarding';
import { clearWorkspace, isFresh, peekWorkspace, readWorkspace, writeWorkspace, type WorkspaceOrg } from '@/lib/workspace-cache';
import { isOrganizationBlocked, isTrialExemptPath } from '@/lib/trial';
import { areaForPath, canAccessArea, type Area } from '@/lib/team';
import {
  Inbox, CalendarDays, KanbanSquare, Users, Plug, ChartNoAxesCombined, Settings,
  MoreHorizontal, UserRound, RefreshCw, CircleHelp, LogOut, Building2, UsersRound, Bot, Compass,
} from 'lucide-react';

export const WORKSPACE_NAV: Array<{ label: string; href: string; icon: typeof Inbox; area: Area }> = [
  { label: 'Inbox', href: '/inbox', icon: Inbox, area: 'inbox' },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays, area: 'agenda' },
  { label: 'CRM', href: '/crm', icon: KanbanSquare, area: 'crm' },
  { label: 'Contatos', href: '/contatos', icon: Users, area: 'contatos' },
  { label: 'Conexões', href: '/chatbots', icon: Plug, area: 'chatbots' },
  { label: 'Agente de IA', href: '/ia', icon: Bot, area: 'ia' },
  { label: 'Relatórios', href: '/relatorios', icon: ChartNoAxesCombined, area: 'relatorios' },
  { label: 'Equipe', href: '/equipe', icon: UsersRound, area: 'equipe' },
  { label: 'Configurações', href: '/configuracoes', icon: Settings, area: 'configuracoes' },
];

type Org = WorkspaceOrg;

export function WorkspaceShell({ children, title, description, actions }: {
  children: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createClient() as any;
  // Troca de tela pelo menu: a empresa já está na memória da aba e a tela aparece na hora.
  const [initial] = useState(() => peekWorkspace(requestedOrganizationId()));
  const [organization, setOrganization] = useState<Org | null>(initial?.organization ?? null);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>(initial?.organizations ?? []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(!initial?.organization);

  useEffect(() => {
    let active = true;
    const requested = requestedOrganizationId();
    const cached = readWorkspace(requested);
    if (cached?.organization) {
      setOrganization(cached.organization);
      setOrganizations(cached.organizations);
      setLoading(false);
      if (isFresh(cached)) return; // dados recentes: nenhuma consulta nesta troca de tela
    }
    async function load() {
      // Sessão salva no navegador (sem ida à rede). O servidor valida o login a cada carregamento completo.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id as string | undefined;
      if (!userId) { clearWorkspace(); window.location.assign('/login'); return; }
      const sameUser = cached?.userId === userId ? cached : null;
      if (cached && !sameUser) clearWorkspace();
      // A empresa pedida no endereço; senão, a primeira em que a pessoa trabalha (vínculo ou suporte liberado).
      const current = await resolveCurrentOrganization<Org>(supabase, userId, 'id,name,status,trial_ends_at', requested).catch(() => null);
      if (!active) return;
      if (current?.organization) setOrganization(current.organization);
      if (current?.accessible) setOrganizations(current.accessible.map(org => ({ id: org.id, name: org.name })));
      setLoading(false);
      if (current?.organization) {
        const keepRole = sameUser && sameUser.organization?.id === current.organization.id;
        writeWorkspace({
          userId,
          organization: current.organization,
          organizations: (current.accessible ?? []).map(org => ({ id: org.id, name: org.name })),
          role: keepRole ? sameUser!.role : null,
          superAdmin: keepRole ? sameUser!.superAdmin : false,
          supportUntil: keepRole ? sameUser!.supportUntil : null,
          roleCheckedAt: keepRole ? sameUser!.roleCheckedAt : undefined,
        });
      }
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  // Teste vencido ou empresa suspensa: sem recarregar a página o servidor não confere a cada clique,
  // então o painel confere aqui também e leva para a assinatura (mesma regra do servidor).
  useEffect(() => {
    if (organization && organizations.length <= 1 && isOrganizationBlocked(organization) && !isTrialExemptPath(pathname)) {
      window.location.replace('/assinatura');
    }
  }, [organization, organizations.length, pathname]);

  // Gaveta aberta no celular: trava a rolagem da página por baixo.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  const { role, superAdmin, supportUntil } = useWorkspaceRole(organization?.id);
  // Página fora do papel da pessoa (ex.: atendente abrindo /configuracoes pelo link): volta para o Inbox.
  // Super Admin sem vínculo com a empresa não abre áreas de atendimento: volta para o Console.
  const area = areaForPath(pathname);
  const blocked = role !== undefined && area !== null && !canAccessArea(role, superAdmin, area);
  const consoleOnly = superAdmin && !role;
  useEffect(() => { if (blocked) window.location.replace(consoleOnly ? '/admin' : '/inbox'); }, [blocked, consoleOnly]);

  async function signOut() {
    clearWorkspace();
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  if (loading || blocked) return <main className="grid min-h-screen place-items-center bg-tendi-haze text-tendi-indigo"><BrandLoader label="Carregando workspace..." size={56} /></main>;
  if (!organization) return <FullPageNotice icon={Building2} title="Workspace não encontrado" description="Sua conta não possui uma empresa ativa vinculada." />;

  const items = WORKSPACE_NAV
    .filter(item => role === undefined ? false : canAccessArea(role, superAdmin, item.area))
    .map(item => ({ ...item, href: withOrganization(item.href, organization.id), active: pathname === item.href || (item.href !== '/inbox' && pathname.startsWith(item.href + '/')) }));
  const sidebar = (mobile: boolean) => <WorkspaceSidebar
    homeHref={consoleOnly ? '/admin' : withOrganization('/inbox', organization.id)}
    organizationId={organization.id}
    organizationName={organization.name}
    organizations={organizations}
    onSwitch={id => window.location.assign(withOrganization(pathname, id))}
    items={items}
    role={role}
    superAdmin={superAdmin}
    onSignOut={signOut}
    onNavigate={() => setMobileOpen(false)}
    onClose={mobile ? () => setMobileOpen(false) : undefined}
  />;

  const menuItem = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-slate-600 transition hover:bg-tendi-haze hover:text-tendi-navy';

  return <main className="flex min-h-screen bg-tendi-haze text-slate-800">
    <div className="sticky top-0 hidden h-screen lg:flex">{sidebar(false)}</div>
    {mobileOpen && <div className="fixed inset-0 z-40 flex lg:hidden">
      <button aria-label="Fechar menu" className="absolute inset-0 bg-tendi-night/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
      <div className="relative z-10 flex h-full animate-pop shadow-2xl">{sidebar(true)}</div>
    </div>}
    <section className="flex min-w-0 flex-1 flex-col">
      <SupportBanner organizationId={organization.id} organizationName={organization.name} supportUntil={supportUntil} />
      <header className="sticky top-0 z-20 border-b border-tendi-line/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex min-h-[60px] w-full max-w-[1600px] items-center justify-between gap-3 px-4 md:min-h-[72px] md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="size-8 shrink-0 rounded-[10px] shadow-card lg:hidden" />
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-tendi-navy md:text-[19px]">{title}</h1>
              <p className="hidden truncate text-[12.5px] text-slate-500 sm:block">{description}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            {actions}
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu de opções" aria-expanded={menuOpen} className={`td-icon-btn ${menuOpen ? 'bg-tendi-mist text-tendi-indigo' : ''}`}><MoreHorizontal size={19} /></button>
            {menuOpen && <>
              <button aria-label="Fechar menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-30 w-60 animate-pop rounded-2xl border border-tendi-line bg-white p-1.5 shadow-pop">
                <div className="mb-1 border-b border-tendi-line/70 px-3 pb-2.5 pt-2"><p className="truncate text-[13px] font-semibold text-tendi-navy">{organization.name}</p><p className="text-[11px] text-slate-400">Opções do workspace</p></div>
                <Link href={withOrganization('/conta', organization.id)} onClick={() => setMenuOpen(false)} className={menuItem}><UserRound size={15} className="text-slate-400" />Minha conta</Link>
                {canAccessArea(role, superAdmin, 'configuracoes') && <Link href={withOrganization('/configuracoes', organization.id)} onClick={() => setMenuOpen(false)} className={menuItem}><Settings size={15} className="text-slate-400" />Configurações</Link>}
                {role && <button onClick={() => { setMenuOpen(false); setMobileOpen(false); window.dispatchEvent(new Event(TOUR_EVENT)); }} className={menuItem}><Compass size={15} className="text-slate-400" />Primeiros passos</button>}
                <button onClick={() => window.location.reload()} className={menuItem}><RefreshCw size={15} className="text-slate-400" />Atualizar página</button>
                <a href="mailto:suporte@tendidesk.com.br" className={menuItem}><CircleHelp size={15} className="text-slate-400" />Ajuda e suporte</a>
                <div className="my-1 border-t border-tendi-line/70" />
                <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-rose-600 transition hover:bg-rose-50"><LogOut size={15} />Sair da conta</button>
              </div>
            </>}
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1600px] flex-1 animate-fade-up p-4 pb-[calc(env(safe-area-inset-bottom)+92px)] md:p-8 md:pb-[calc(env(safe-area-inset-bottom)+100px)] lg:pb-10">{children}</div>
      <MobileTabBar fixed pathname={pathname} organizationId={organization.id} role={role} superAdmin={superAdmin} onMenu={() => setMobileOpen(true)} />
      <OnboardingTour organizationId={organization.id} role={role} superAdmin={superAdmin} />
    </section>
  </main>;
}
