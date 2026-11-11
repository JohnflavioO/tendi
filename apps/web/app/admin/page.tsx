'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Building2, CheckCircle2, CircleHelp, Clock3,
  ExternalLink, LayoutDashboard, Loader2, LogOut, MessageSquare, Plus,
  ShieldCheck, Sparkles, Users, X, Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Organization = {
  id: string; name: string; slug: string; status: string; plan_code: string; created_at: string;
};

type Metrics = {
  companies: number; activeCompanies: number; trialCompanies: number;
  suspendedCompanies: number; members: number; conversations: number; contacts: number;
};

const emptyMetrics: Metrics = {
  companies: 0, activeCompanies: 0, trialCompanies: 0,
  suspendedCompanies: 0, members: 0, conversations: 0, contacts: 0,
};

function MetricCard({ label, value, detail, icon: Icon, accent }: {
  label: string; value: number; detail: string; icon: React.ElementType; accent: string;
}) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-[#25275B]">{value.toLocaleString('pt-BR')}</p>
    </div><span className={'rounded-xl p-3 ' + accent}><Icon size={20}/></span></div>
    <p className="mt-3 text-xs text-slate-400">{detail}</p>
  </article>;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [createdOrganization, setCreatedOrganization] = useState<Organization | null>(null);

  const customerOrganizations = useMemo(() => organizations.filter(org => org.slug !== 'tendi'), [organizations]);
  const internalOrganization = useMemo(() => organizations.find(org => org.slug === 'tendi'), [organizations]);

  async function load() {
    const supabase = createClient() as any;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { window.location.assign('/login'); return; }
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
    if (!admin) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);

    const [orgResult, memberResult, conversationResult, contactResult] = await Promise.all([
      supabase.from('organizations').select('id,name,slug,status,plan_code,created_at').order('created_at', { ascending: false }),
      supabase.from('organization_memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
    ]);

    if (orgResult.error) setError(orgResult.error.message);
    const allOrganizations = (orgResult.data ?? []) as Organization[];
    setOrganizations(allOrganizations);
    const customers = allOrganizations.filter(org => org.slug !== 'tendi');
    setMetrics({
      companies: customers.length,
      activeCompanies: customers.filter(org => org.status === 'active').length,
      trialCompanies: customers.filter(org => org.status === 'trial').length,
      suspendedCompanies: customers.filter(org => org.status === 'suspended').length,
      members: memberResult.count ?? 0,
      conversations: conversationResult.count ?? 0,
      contacts: contactResult.count ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) return;
    setSaving(true); setError(''); setCreatedOrganization(null);
    const supabase = createClient() as any;
    try {
      const baseSlug = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = baseSlug + '-' + Math.random().toString(36).slice(2, 6);
      const { data: organization, error: orgError } = await supabase.from('organizations')
        .insert({ name: cleanName, slug, status: 'active', plan_code: 'starter' })
        .select('id,name,slug,status,plan_code,created_at').single();
      if (orgError) throw orgError;
      const { error: teamError } = await supabase.from('teams').insert({
        organization_id: organization.id, name: 'Atendimento',
        description: 'Equipe principal de atendimento', color: '#004751',
      });
      if (teamError) throw teamError;
      const { data: pipeline, error: pipelineError } = await supabase.from('crm_pipelines')
        .insert({ organization_id: organization.id, name: 'Vendas', is_default: true }).select('id').single();
      if (pipelineError) throw pipelineError;
      const stages = [
        { name: 'Novo lead', position: 0, color: '#2F316B', final_type: 'open' },
        { name: 'Contato feito', position: 1, color: '#004751', final_type: 'open' },
        { name: 'Proposta enviada', position: 2, color: '#CB0A9F', final_type: 'open' },
        { name: 'Em negociação', position: 3, color: '#2F316B', final_type: 'open' },
        { name: 'Fechado', position: 4, color: '#004751', final_type: 'won' },
        { name: 'Perdido', position: 5, color: '#64748b', final_type: 'lost' },
      ].map(stage => ({ ...stage, organization_id: organization.id, pipeline_id: pipeline.id }));
      const { error: stagesError } = await supabase.from('crm_stages').insert(stages);
      if (stagesError) throw stagesError;
      setName('');
      setCreatedOrganization(organization as Organization);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally { setSaving(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28}/></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32}/><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Esta área é exclusiva do Super Admin da plataforma.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const inboxUrl = (id: string) => '/inbox?organization=' + encodeURIComponent(id);
  const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

  return <main className="min-h-screen bg-[#F6F7FB] text-slate-800">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain"/><span className="border-l border-slate-200 pl-3 text-xs font-medium text-slate-500">Console</span></div>
      <div className="px-4 pt-6"><p className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Plataforma</p>
        <a href="#overview" className="mt-2 flex items-center gap-3 rounded-xl bg-[#F0F1FA] px-3 py-3 text-sm font-semibold text-[#2F316B]"><LayoutDashboard size={18}/> Visão geral</a>
        <a href="#companies" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Building2 size={18}/> Empresas <span className="ml-auto text-xs text-slate-400">{metrics.companies}</span></a>
        <a href="#new-company" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Plus size={18}/> Nova empresa</a>
      </div>
      <div className="px-4 pt-7"><p className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Gestão</p>
        <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400"><Users size={18}/> Usuários <span className="ml-auto text-[10px]">Em breve</span></div>
        <a href="/admin/plans" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Zap size={18}/> Planos e recursos <ArrowRight size={14} className="ml-auto text-slate-400"/></a>
        <a href="/admin/pagamentos" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Zap size={18}/> Pagamentos e assinaturas <ArrowRight size={14} className="ml-auto text-slate-400"/></a>
        <a href="/admin/whatsapp"className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><MessageSquare size={18}/> Conectividade WhatsApp <ArrowRight size={14} className="ml-auto text-slate-400"/></a>
        <a href="/admin/ia" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Sparkles size={18}/> Agentes de IA <ArrowRight size={14} className="ml-auto text-slate-400"/></a>
        <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400"><Clock3 size={18}/> Testes gratuitos <span className="ml-auto text-[10px]">Em breve</span></div>
      </div>
      <div className="mt-auto border-t border-slate-100 p-4">
        {internalOrganization && <a href={inboxUrl(internalOrganization.id)} className="mb-3 flex items-center gap-3 rounded-xl bg-[#F6F7FB] p-3 text-left hover:bg-[#F0F1FA]"><span className="rounded-lg bg-white p-2 text-[#2F316B]"><Building2 size={17}/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-700">Workspace Tendi</span><span className="block text-[10px] text-slate-400">Ambiente interno</span></span><ArrowRight size={14} className="text-slate-400"/></a>}
        <div className="flex items-center gap-2 px-2 text-xs text-slate-500"><ShieldCheck size={15} className="text-[#CB0A9F]"/> Super Admin</div>
        <a href="/auth/signout" className="mt-3 flex items-center gap-2 px-2 text-xs text-slate-400 hover:text-slate-700"><LogOut size={14}/> Sair da plataforma</a>
      </div>
    </aside>

    <div className="lg:pl-64">
      <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8"><div><p className="text-xs text-slate-400">Console / Visão geral</p><p className="text-sm font-semibold text-[#2F316B]">Painel de administração</p></div><div className="flex items-center gap-2 rounded-full bg-[#edf0fb] px-3 py-2 text-xs font-semibold text-[#2F316B]"><ShieldCheck size={15}/> Super Admin</div></header>

      <div className="mx-auto max-w-[1440px] space-y-7 px-5 py-7 sm:px-8 sm:py-9">
        <section id="overview" className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Visão geral</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#25275B]">Olá! Aqui está o Tendi.</h1><p className="mt-2 text-sm text-slate-500">Acompanhe as contas e a atividade da sua plataforma em um só lugar.</p></div><a href="#new-company" className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#003b43]"><Plus size={17}/> Nova empresa</a></section>

        {createdOrganization && <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={21}/><div><p className="font-semibold text-emerald-900">{createdOrganization.name} foi criada.</p><p className="mt-1 text-sm text-emerald-800">A estrutura inicial está pronta. Agora, configure o administrador responsável.</p></div></div><a href={'/admin/organizations/' + createdOrganization.id + '/setup'} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white">Configurar empresa <ArrowRight size={16}/></a><button onClick={() => setCreatedOrganization(null)} aria-label="Fechar aviso" className="rounded-lg p-1 text-emerald-700"><X size={16}/></button></div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Empresas clientes" value={metrics.companies} detail={metrics.activeCompanies + ' contas ativas na plataforma'} icon={Building2} accent="bg-[#F0F1FA] text-[#2F316B]"/>
          <MetricCard label="Em período de teste" value={metrics.trialCompanies} detail="Contas com status de teste gratuito" icon={Clock3} accent="bg-amber-50 text-amber-600"/>
          <MetricCard label="Usuários vinculados" value={metrics.members} detail="Membros ativos nas empresas" icon={Users} accent="bg-cyan-50 text-cyan-700"/>
          <MetricCard label="Conversas registradas" value={metrics.conversations} detail={metrics.contacts + ' contatos cadastrados'} icon={MessageSquare} accent="bg-fuchsia-50 text-[#CB0A9F]"/>
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
          <div id="companies" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6"><div><h2 className="font-bold text-[#25275B]">Empresas cadastradas</h2><p className="mt-1 text-xs text-slate-500">Acompanhe e acesse os ambientes dos clientes.</p></div><span className="rounded-full bg-[#edf0fb] px-3 py-1 text-xs font-semibold text-[#2F316B]">{customerOrganizations.length} contas</span></div>
            {customerOrganizations.length ? <div className="divide-y divide-slate-100">{customerOrganizations.slice(0, 6).map(org => <article key={org.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F0F1FA] text-[#2F316B]"><Building2 size={19}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{org.name}</p><p className="mt-1 text-xs text-slate-400">Criada em {formatDate(org.created_at)} · {org.plan_code}</p></div></div><div className="flex items-center gap-2"><span className={org.status === 'active' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700' : org.status === 'trial' ? 'rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600'}>{org.status === 'active' ? 'Ativa' : org.status === 'trial' ? 'Em teste' : org.status === 'suspended' ? 'Suspensa' : org.status}</span><a href={'/admin/organizations/' + org.id + '/setup'} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#004751] hover:bg-slate-50">Gerenciar <ExternalLink size={13}/></a></div></article>)}</div> : <div className="px-6 py-12 text-center"><Building2 className="mx-auto text-slate-300" size={32}/><p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma empresa cliente cadastrada</p><p className="mt-1 text-xs text-slate-400">Cadastre a primeira empresa para começar.</p></div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6"><span className="text-xs text-slate-400">{metrics.suspendedCompanies} suspensas · {metrics.activeCompanies} ativas</span><a href="#new-company" className="inline-flex items-center gap-1 text-xs font-semibold text-[#004751]">Adicionar empresa <ArrowRight size={14}/></a></div>
          </div>

          <div className="space-y-5">
            <section id="new-company" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><span className="rounded-lg bg-[#FDF0FA] p-2 text-[#CB0A9F]"><Plus size={17}/></span><h2 className="font-bold text-[#25275B]">Cadastrar empresa</h2></div><p className="mt-3 text-sm leading-6 text-slate-500">Crie o ambiente do cliente com equipe de atendimento e pipeline comercial inicial.</p>
              <form onSubmit={createOrganization} className="mt-5"><label htmlFor="company-name" className="text-sm font-semibold text-slate-700">Nome da empresa</label><input id="company-name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Aurora Studio" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10"/>{error && <p role="alert" className="mt-3 break-words text-sm text-red-600">{error}</p>}<button disabled={saving || name.trim().length < 2} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#003b43] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={17}/> : <Plus size={17}/>} {saving ? 'Criando empresa...' : 'Criar empresa'}</button></form>
            </section>

            <section className="rounded-2xl border border-[#2F316B]/10 bg-[#F0F1FA] p-5"><div className="flex items-center gap-2 text-[#2F316B]"><Activity size={17}/><h2 className="text-sm font-bold">Resumo da operação</h2></div><div className="mt-4 space-y-3"><div className="flex items-center justify-between text-sm"><span className="text-slate-500">Contas ativas</span><strong className="text-[#25275B]">{metrics.activeCompanies}</strong></div><div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#004751]" style={{ width: (metrics.companies ? Math.min(100, metrics.activeCompanies / metrics.companies * 100) : 0) + '%' }}/></div><div className="flex items-center justify-between text-sm"><span className="text-slate-500">Contas suspensas</span><strong className="text-[#25275B]">{metrics.suspendedCompanies}</strong></div><div className="flex items-center justify-between text-sm"><span className="text-slate-500">Contas em teste</span><strong className="text-[#25275B]">{metrics.trialCompanies}</strong></div></div><p className="mt-4 text-[11px] leading-5 text-slate-400">Indicadores calculados a partir dos registros atuais. Gestão de planos, cobrança e testes será habilitada nas próximas etapas.</p></section>
          </div>
        </section>

        {internalOrganization && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-[#2F316B]/20 bg-white p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#F0F1FA] p-3 text-[#2F316B]"><Building2 size={20}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#2F316B]">Workspace interno</p><p className="mt-1 text-sm font-semibold text-slate-800">{internalOrganization.name}</p><p className="mt-1 text-xs text-slate-400">Ambiente da equipe Tendi para administração e testes, separado dos clientes.</p></div></div><a href={inboxUrl(internalOrganization.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-[#2F316B] hover:bg-slate-50">Abrir workspace <ArrowRight size={14}/></a></section>}

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-5 text-[11px] text-slate-400"><span>Tendi Console · Administração da plataforma</span><span className="inline-flex items-center gap-1"><CircleHelp size={12}/> Painel em evolução</span></footer>
      </div>
    </div>
  </main>;
}
