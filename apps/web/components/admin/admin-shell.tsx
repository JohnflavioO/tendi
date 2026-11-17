'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Activity, ArrowRight, Bot, Building2, ChevronRight, CreditCard, ExternalLink, LayoutDashboard, LogOut,
  Menu, MessageSquare, Plus, Search, X, Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Layout único do Console (Super Admin): menu agrupado, trilha, ações da página e busca rápida (⌘K / Ctrl+K).
 */

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; hint?: string };
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Clientes', items: [
    { label: 'Visão geral', href: '/admin', icon: LayoutDashboard, hint: 'Receita, clientes e próximos passos' },
  ] },
  { group: 'Receita', items: [
    { label: 'Pagamentos e assinaturas', href: '/admin/pagamentos', icon: CreditCard, hint: 'Pagar.me, webhook e assinantes' },
    { label: 'Planos e recursos', href: '/admin/plans', icon: Zap, hint: 'O que cada plano libera' },
  ] },
  { group: 'Produto', items: [
    { label: 'Agentes de IA', href: '/admin/ia', icon: Bot, hint: 'Chave, modelo e treinamento por empresa' },
    { label: 'Consumo da IA', href: '/admin/ia/consumo', icon: Activity, hint: 'Limites, custo e margem' },
    { label: 'Conectividade WhatsApp', href: '/admin/whatsapp', icon: MessageSquare, hint: 'Sessões do WhatsApp' },
  ] },
];
const ALL_ITEMS = NAV.flatMap(group => group.items);

/** Abre o diálogo "Nova empresa" da visão geral de qualquer tela do Console. */
export const NEW_COMPANY_HREF = '/admin?nova=1';

export function AdminShell({ title, description, actions, children, width = 'max-w-6xl' }: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [internalOrg, setInternalOrg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const email = String(data.user.email ?? '');
      setUser({ name: String(data.user.user_metadata?.full_name ?? email.split('@')[0] ?? ''), email });
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'tendi').maybeSingle();
      if (org) setInternalOrg(org.id);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(open => !open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = ALL_ITEMS.filter(item => pathname === item.href || pathname.startsWith(item.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  const group = NAV.find(entry => entry.items.includes(current ?? ALL_ITEMS[0]!))?.group;

  // Gaveta aberta no celular: trava a rolagem da página por baixo.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  const sidebar = (mobile: boolean) => <aside className="td-sidebar flex h-full w-[264px] shrink-0 flex-col overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[env(safe-area-inset-top)] text-white">
    <div className="flex h-[72px] items-center justify-between gap-2 px-5">
      <Link href="/admin" className="flex items-center gap-2.5"><img src="/brand/tendidesk-logo-branca.png" alt="TendiDesk" width="1291" height="640" className="h-9 w-auto object-contain" /><span className="rounded-md bg-tendi-magenta/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.14em] text-[#F7A8E2] ring-1 ring-inset ring-tendi-magenta/30">Console</span></Link>
      {mobile && <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-[#B9BBE0] hover:bg-white/10 hover:text-white"><X size={18} /></button>}
    </div>
    <div className="px-3">
      <button type="button" onClick={() => { setMobileOpen(false); setPaletteOpen(true); }} className="flex h-10 w-full items-center gap-2 rounded-xl bg-white/[.06] px-3 text-left text-[13px] text-[#B9BBE0] ring-1 ring-inset ring-white/10 transition hover:bg-white/[.10] hover:text-white">
        <Search size={15} /> Buscar ou ir para…<kbd className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-[#B9BBE0]">Ctrl K</kbd>
      </button>
    </div>
    <nav aria-label="Menu do Console" className="mt-5 flex-1 space-y-5 px-3 pb-4">
      {NAV.map(entry => <div key={entry.group}>
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#7275B0]">{entry.group}</p>
        <ul className="space-y-0.5">{entry.items.map(item => {
          const active = current?.href === item.href;
          const Icon = item.icon;
          return <li key={item.href}><Link href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined} className={`td-nav-item ${active ? 'td-nav-item-active' : ''}`}><Icon size={17} strokeWidth={active ? 2.1 : 1.8} className={active ? 'text-white' : 'text-[#8E91C4]'} /><span className="truncate">{item.label}</span></Link></li>;
        })}</ul>
      </div>)}
    </nav>
    <div className="space-y-2 border-t border-white/[.08] p-3">
      {internalOrg && <Link href={`/inbox?organization=${internalOrg}`} className="group flex items-center gap-3 rounded-xl bg-white/[.06] p-2.5 ring-1 ring-inset ring-white/10 transition hover:bg-white/[.10]"><span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-tendi-magenta to-tendi-lilac text-white"><Building2 size={15} /></span><span className="min-w-0"><span className="block text-xs font-semibold text-white">Workspace TendiDesk</span><span className="block text-[10.5px] text-[#8E91C4]">Ambiente interno de testes</span></span><ArrowRight size={14} className="ml-auto text-[#8E91C4] transition group-hover:translate-x-0.5 group-hover:text-white" /></Link>}
      <a href="/" target="_blank" rel="noopener" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#B9BBE0] transition hover:bg-white/[.06] hover:text-white"><ExternalLink size={15} /> Ver site do TendiDesk</a>
      <div className="flex items-center gap-2.5 rounded-xl bg-white/[.04] px-2.5 py-2 ring-1 ring-inset ring-white/[.06]">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-tendi-lilac to-tendi-magenta text-[11px] font-bold text-white">{(user?.name || 'S').slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{user?.name || 'Super Admin'}</span><span className="block truncate text-[10.5px] text-[#8E91C4]">{user?.email || 'Super Admin'}</span></span>
        <form action="/auth/signout" method="post"><button title="Sair" aria-label="Sair da plataforma" className="rounded-lg p-1.5 text-[#8E91C4] transition hover:bg-rose-500/10 hover:text-rose-200"><LogOut size={15} /></button></form>
      </div>
    </div>
  </aside>;

  return <div className="min-h-screen bg-tendi-haze text-slate-800">
    <div className="fixed inset-y-0 left-0 z-30 hidden lg:flex">{sidebar(false)}</div>
    {mobileOpen && <div className="fixed inset-0 z-40 flex lg:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-tendi-night/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} /><div className="relative z-10 flex h-full animate-pop shadow-2xl">{sidebar(true)}</div></div>}

    <div className="lg:pl-[264px]">
      <header className="sticky top-0 z-20 border-b border-tendi-line/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className={`mx-auto flex min-h-[64px] w-full ${width} flex-wrap items-center gap-3 px-4 py-3 sm:px-8 md:min-h-[72px]`}>
          <button onClick={() => setMobileOpen(true)} className="td-icon-btn -ml-1 lg:hidden" aria-label="Abrir menu"><Menu size={19} /></button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-medium text-slate-400">Console{group && <><ChevronRight size={12} />{group}</>}</p>
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-tendi-navy md:text-[19px]">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPaletteOpen(true)} className="td-icon-btn border border-tendi-line bg-white lg:hidden" aria-label="Buscar"><Search size={16} /></button>
            {actions}
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-6 sm:px-8 sm:pt-8`}>
        {description && <p className="mb-6 max-w-3xl text-[13.5px] leading-6 text-slate-500">{description}</p>}
        <div className="animate-fade-up">{children}</div>
      </main>
    </div>

    {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
  </div>;
}

type Command = { id: string; label: string; hint: string; href: string; icon: typeof LayoutDashboard; keywords: string };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      const supabase = createClient() as any;
      const { data } = await supabase.from('organizations').select('id,name,slug').order('name').limit(200);
      setCompanies(((data ?? []) as Array<{ id: string; name: string; slug: string }>).filter(org => org.slug !== 'tendi'));
    })().catch(() => undefined);
  }, []);

  const commands = useMemo<Command[]>(() => [
    { id: 'new', label: 'Nova empresa', hint: 'Cadastrar um cliente', href: NEW_COMPANY_HREF, icon: Plus, keywords: 'criar cadastrar cliente empresa nova' },
    ...ALL_ITEMS.map(item => ({ id: item.href, label: item.label, hint: item.hint ?? '', href: item.href, icon: item.icon, keywords: item.label.toLowerCase() })),
    { id: 'site', label: 'Ver site do TendiDesk', hint: 'Abrir a página pública', href: '/', icon: ExternalLink, keywords: 'site landing página' },
    ...companies.flatMap(org => [
      { id: `ws-${org.id}`, label: org.name, hint: 'Ficha da empresa', href: `/admin/organizations/${org.id}`, icon: Building2, keywords: `${org.name.toLowerCase()} empresa cliente ficha bloquear suporte` },
      { id: `setup-${org.id}`, label: `${org.name}: administrador`, hint: 'Convidar o responsável', href: `/admin/organizations/${org.id}/setup`, icon: Bot, keywords: `${org.name.toLowerCase()} gerenciar configurar admin` },
    ]),
  ], [companies]);

  const normalized = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const results = commands.filter(command => !normalized || `${command.label} ${command.keywords}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(normalized)).slice(0, 9);

  useEffect(() => { setIndex(0); }, [query]);

  const go = (command?: Command) => { if (command) window.location.assign(command.href); };

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Buscar no Console" onMouseDown={event => event.stopPropagation()} className="animate-pop w-full max-w-xl overflow-hidden rounded-card border border-tendi-line bg-white shadow-pop">
      <div className="flex items-center gap-3 border-b border-tendi-line/70 px-4">
        <Search size={17} className="text-slate-400" />
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); go(results[index]); }
        }} placeholder="Buscar empresa, página ou ação…" className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        <kbd className="rounded-md border border-tendi-line px-1.5 text-[10px] text-slate-400">Esc</kbd>
      </div>
      <ul className="max-h-[380px] overflow-y-auto p-2">
        {results.map((command, i) => { const Icon = command.icon; return <li key={command.id}>
          <button type="button" onMouseEnter={() => setIndex(i)} onClick={() => go(command)} className={i === index ? 'flex w-full items-center gap-3 rounded-xl bg-tendi-mist px-3 py-2.5 text-left' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left'}>
            <span className={i === index ? 'rounded-lg bg-white p-1.5 text-tendi-magenta shadow-card' : 'rounded-lg bg-slate-50 p-1.5 text-slate-400'}><Icon size={15} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{command.label}</span><span className="block truncate text-[11px] text-slate-400">{command.hint}</span></span>
            {i === index && <ArrowRight size={14} className="text-slate-400" />}
          </button>
        </li>; })}
        {!results.length && <li className="px-3 py-8 text-center text-sm text-slate-400">Nada encontrado para “{query}”.</li>}
      </ul>
    </div>
  </div>;
}
