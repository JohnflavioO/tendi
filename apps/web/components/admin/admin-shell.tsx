'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Activity, ArrowRight, Bot, Building2, ChevronRight, CreditCard, ExternalLink, LayoutDashboard, LogOut,
  Menu, MessageSquare, Plus, Search, Sparkles, X, Zap,
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
    { label: 'Agentes de IA', href: '/admin/ia', icon: Sparkles, hint: 'Chave, modelo e treinamento por empresa' },
    { label: 'Consumo da IA', href: '/admin/ia/consumo', icon: Activity, hint: 'Limites, custo e margem' },
    { label: 'Conectividade WhatsApp', href: '/admin/whatsapp', icon: MessageSquare, hint: 'Sessões da D-API' },
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

  const sidebar = <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white">
    <div className="flex h-16 items-center gap-2.5 px-5">
      <a href="/admin" className="flex items-center gap-2.5"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-8 w-auto object-contain" /></a>
      <span className="rounded-md bg-[#25275B] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Console</span>
    </div>
    <div className="px-3">
      <button type="button" onClick={() => setPaletteOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-[13px] text-slate-400 transition hover:border-slate-300 hover:bg-white">
        <Search size={15} /> Buscar ou ir para…<kbd className="ml-auto rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400">Ctrl K</kbd>
      </button>
    </div>
    <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {NAV.map(entry => <div key={entry.group}>
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{entry.group}</p>
        <ul className="space-y-0.5">{entry.items.map(item => {
          const active = current?.href === item.href;
          const Icon = item.icon;
          return <li key={item.href}><a href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined} className={active
            ? 'relative flex items-center gap-3 rounded-xl bg-[#F1F1FB] px-3 py-2 text-[13px] font-semibold text-[#25275B] before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-[#CB0A9F]'
            : 'flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-[#25275B]'}><Icon size={17} className={active ? 'text-[#CB0A9F]' : 'text-slate-400'} />{item.label}</a></li>;
        })}</ul>
      </div>)}
    </nav>
    <div className="space-y-2 border-t border-slate-100 p-3">
      {internalOrg && <a href={`/inbox?organization=${internalOrg}`} className="group flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#F4F4FC] to-[#FBF2F9] p-3 transition hover:from-[#EEEEFA]"><span className="rounded-lg bg-white p-1.5 text-[#25275B] shadow-sm"><Building2 size={15} /></span><span className="min-w-0"><span className="block text-xs font-semibold text-[#25275B]">Workspace Tendi</span><span className="block text-[10px] text-slate-500">Ambiente interno de testes</span></span><ArrowRight size={14} className="ml-auto text-slate-400 transition group-hover:translate-x-0.5" /></a>}
      <a href="/" target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-[#004751]"><ExternalLink size={14} /> Ver site do Tendi</a>
      <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#25275B] to-[#CB0A9F] text-[11px] font-bold text-white">{(user?.name || 'S').slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-700">{user?.name || 'Super Admin'}</span><span className="block truncate text-[10px] text-slate-400">{user?.email || 'Super Admin'}</span></span>
        <form action="/auth/signout" method="post"><button title="Sair" aria-label="Sair da plataforma" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={15} /></button></form>
      </div>
    </div>
  </aside>;

  return <div className="min-h-screen bg-[#F7F8FC] text-slate-800">
    <div className="fixed inset-y-0 left-0 z-30 hidden lg:flex">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-40 flex lg:hidden"><button aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} /><div className="relative z-10 animate-pop">{sidebar}<button onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500"><X size={18} /></button></div></div>}

    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#F7F8FC]/85 backdrop-blur-md">
        <div className={`mx-auto flex min-h-16 w-full ${width} flex-wrap items-center gap-3 px-5 py-3 sm:px-8`}>
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden" aria-label="Abrir menu"><Menu size={19} /></button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-medium text-slate-400">Console{group && <><ChevronRight size={12} />{group}</>}</p>
            <h1 className="truncate text-lg font-semibold tracking-tight text-[#1D1F4E]">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPaletteOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-[#25275B] lg:hidden" aria-label="Buscar"><Search size={16} /></button>
            {actions}
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} px-5 py-7 sm:px-8 sm:py-8`}>
        {description && <p className="-mt-2 mb-6 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
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
    { id: 'site', label: 'Ver site do Tendi', hint: 'Abrir a página pública', href: '/', icon: ExternalLink, keywords: 'site landing página' },
    ...companies.flatMap(org => [
      { id: `ws-${org.id}`, label: org.name, hint: 'Abrir workspace', href: `/inbox?organization=${org.id}`, icon: Building2, keywords: `${org.name.toLowerCase()} workspace inbox` },
      { id: `setup-${org.id}`, label: `${org.name}: administrador`, hint: 'Convidar o responsável', href: `/admin/organizations/${org.id}/setup`, icon: Bot, keywords: `${org.name.toLowerCase()} gerenciar configurar admin` },
    ]),
  ], [companies]);

  const normalized = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const results = commands.filter(command => !normalized || `${command.label} ${command.keywords}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(normalized)).slice(0, 9);

  useEffect(() => { setIndex(0); }, [query]);

  const go = (command?: Command) => { if (command) window.location.assign(command.href); };

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Buscar no Console" onMouseDown={event => event.stopPropagation()} className="animate-pop w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4">
        <Search size={17} className="text-slate-400" />
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); go(results[index]); }
        }} placeholder="Buscar empresa, página ou ação…" className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        <kbd className="rounded-md border border-slate-200 px-1.5 text-[10px] text-slate-400">Esc</kbd>
      </div>
      <ul className="max-h-[380px] overflow-y-auto p-2">
        {results.map((command, i) => { const Icon = command.icon; return <li key={command.id}>
          <button type="button" onMouseEnter={() => setIndex(i)} onClick={() => go(command)} className={i === index ? 'flex w-full items-center gap-3 rounded-xl bg-[#F1F1FB] px-3 py-2.5 text-left' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left'}>
            <span className={i === index ? 'rounded-lg bg-white p-1.5 text-[#CB0A9F] shadow-sm' : 'rounded-lg bg-slate-50 p-1.5 text-slate-400'}><Icon size={15} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{command.label}</span><span className="block truncate text-[11px] text-slate-400">{command.hint}</span></span>
            {i === index && <ArrowRight size={14} className="text-slate-400" />}
          </button>
        </li>; })}
        {!results.length && <li className="px-3 py-8 text-center text-sm text-slate-400">Nada encontrado para “{query}”.</li>}
      </ul>
    </div>
  </div>;
}
