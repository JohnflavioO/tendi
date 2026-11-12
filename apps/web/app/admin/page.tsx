'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Building2, Check, CheckCircle2, CircleDollarSign, Clock3,
  CreditCard, Loader2, MessageSquare, Plus, Search, ShieldCheck, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import { monthStartIso, normalizePricing } from '@/lib/ai-limits';
import { trialDaysLeft, isTrialExpired } from '@/lib/trial';

type Organization = { id: string; name: string; slug: string; status: string; plan_code: string | null; created_at: string; trial_ends_at: string | null };
type Plan = { code: string; name: string; monthly_price: number | null; annual_price: number | null; pagarme_plan_id: string | null };
type Subscription = { organization_id: string; status: 'active' | 'past_due' | 'canceled'; plan_code: string | null; billing_period: 'monthly' | 'annual' | null };
type Usage = { organization_id: string; replies: number; cost_usd: number };
type BillingEvent = { id: string; type: string; organization_id: string | null; received_at: string };
type Setup = { payments: boolean | null; plans: boolean; ai: boolean | null };

type Situation = { key: 'paying' | 'past_due' | 'trial' | 'expired' | 'suspended' | 'no_subscription'; label: string; tone: string };
const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'paying', label: 'Pagantes' },
  { key: 'trial', label: 'Em teste' },
  { key: 'attention', label: 'Atenção' },
  { key: 'no_subscription', label: 'Sem assinatura' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value >= 1000 ? 0 : 2 });
const shortDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const initials = (name: string) => name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
const EVENT_LABEL: Record<string, string> = {
  'subscription.created': 'assinou um plano',
  'subscription.canceled': 'cancelou a assinatura',
  'charge.paid': 'pagamento aprovado',
  'invoice.paid': 'fatura paga',
  'charge.payment_failed': 'pagamento recusado',
  'invoice.payment_failed': 'fatura não paga',
};

function situationOf(org: Organization, sub: Subscription | undefined): Situation {
  if (org.status === 'suspended') return { key: 'suspended', label: 'Suspensa', tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
  if (sub?.status === 'past_due') return { key: 'past_due', label: 'Pagamento pendente', tone: 'bg-amber-50 text-amber-700 ring-amber-200' };
  if (sub?.status === 'active') return { key: 'paying', label: 'Pagante', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (org.status === 'trial') {
    if (isTrialExpired(org)) return { key: 'expired', label: 'Teste vencido', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
    const days = trialDaysLeft(org);
    return { key: 'trial', label: days === null ? 'Em teste' : `Teste · ${days} ${days === 1 ? 'dia' : 'dias'}`, tone: 'bg-sky-50 text-sky-700 ring-sky-200' };
  }
  return { key: 'no_subscription', label: 'Ativa sem assinatura', tone: 'bg-violet-50 text-violet-700 ring-violet-200' };
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [members, setMembers] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [counts, setCounts] = useState({ conversations: 0, contacts: 0 });
  const [usdBrl, setUsdBrl] = useState(5.5);
  const [setup, setSetup] = useState<Setup>({ payments: null, plans: false, ai: null });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient() as any;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { window.location.assign('/login'); return; }
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (!admin) { setLoading(false); return; }
    setAuthorized(true);
    setFirstName(String(auth.user.user_metadata?.full_name ?? auth.user.email ?? '').split(/[\s@]/)[0] ?? '');

    const [orgRes, planRes, subRes, usageRes, memberRes, eventRes, totalsRes, pricingRes, billingStatus, aiStatus] = await Promise.all([
      supabase.from('organizations').select('id,name,slug,status,plan_code,created_at,trial_ends_at').order('created_at', { ascending: false }),
      supabase.from('subscription_plans').select('code,name,monthly_price,annual_price,pagarme_plan_id').order('display_order'),
      supabase.from('billing_subscriptions').select('organization_id,status,plan_code,billing_period'),
      supabase.rpc('ai_usage_by_organization', { p_since: monthStartIso() }),
      supabase.from('organization_memberships').select('organization_id').in('status', ['active', 'invited']),
      supabase.from('billing_events').select('id,type,organization_id,received_at').not('organization_id', 'is', null).order('received_at', { ascending: false }).limit(8),
      // Só os totais: o Super Admin não lê conversas nem contatos das empresas.
      supabase.rpc('platform_usage_totals'),
      supabase.from('platform_settings').select('value').eq('key', 'ai_pricing').maybeSingle(),
      fetch('/api/admin/billing').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/ai/status').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (orgRes.error) setError(orgRes.error.message);
    const planList = (planRes.data ?? []) as Plan[];
    setOrgs((orgRes.data ?? []) as Organization[]);
    setPlans(planList);
    setSubs((subRes.data ?? []) as Subscription[]);
    setUsage(((usageRes.data ?? []) as any[]).map(row => ({ organization_id: row.organization_id, replies: Number(row.replies), cost_usd: Number(row.cost_usd) })));
    setMembers(((memberRes.data ?? []) as Array<{ organization_id: string }>).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.organization_id]: (acc[row.organization_id] ?? 0) + 1 }), {}));
    setEvents((eventRes.data ?? []) as BillingEvent[]);
    const totals = Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data;
    setCounts({ conversations: Number(totals?.conversations ?? 0), contacts: Number(totals?.contacts ?? 0) });
    setUsdBrl(normalizePricing(pricingRes.data?.value).usdBrl);
    const keys = aiStatus?.keys as Record<string, { configured?: boolean } | boolean> | undefined;
    setSetup({
      payments: billingStatus ? Boolean(billingStatus.secretKey?.configured) : null,
      plans: planList.length > 0 && planList.every(plan => plan.pagarme_plan_id && plan.monthly_price),
      ai: keys ? Object.values(keys).some(value => (typeof value === 'object' ? value?.configured : value)) : null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    if (new URLSearchParams(window.location.search).get('nova') === '1') setCreating(true);
  }, [load]);

  const customers = useMemo(() => orgs.filter(org => org.slug !== 'tendi'), [orgs]);
  const planOf = useCallback((code: string | null) => plans.find(plan => plan.code === code), [plans]);
  const rows = useMemo(() => customers.map(org => {
    const sub = subs.find(item => item.organization_id === org.id);
    const plan = planOf(sub?.plan_code ?? org.plan_code);
    const situation = situationOf(org, sub);
    const monthly = sub && sub.status !== 'canceled' && plan
      ? (sub.billing_period === 'annual' ? Number(plan.annual_price ?? 0) / 12 : Number(plan.monthly_price ?? 0))
      : 0;
    const used = usage.find(item => item.organization_id === org.id);
    return { org, sub, plan, situation, monthly, aiReplies: used?.replies ?? 0, aiCost: (used?.cost_usd ?? 0) * usdBrl, members: members[org.id] ?? 0 };
  }), [customers, subs, planOf, usage, members, usdBrl]);

  const mrr = rows.reduce((sum, row) => sum + row.monthly, 0);
  const paying = rows.filter(row => row.situation.key === 'paying' || row.situation.key === 'past_due').length;
  const trials = rows.filter(row => row.situation.key === 'trial').length;
  const attention = rows.filter(row => ['past_due', 'expired', 'suspended'].includes(row.situation.key)).length;
  const aiCost = rows.reduce((sum, row) => sum + row.aiCost, 0);
  const conversion = paying + trials + rows.filter(row => row.situation.key === 'expired').length;

  const filtered = rows.filter(row => {
    const text = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const matches = !text || row.org.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(text);
    const byFilter = filter === 'all'
      || (filter === 'paying' && row.situation.key === 'paying')
      || (filter === 'trial' && row.situation.key === 'trial')
      || (filter === 'attention' && ['past_due', 'expired', 'suspended'].includes(row.situation.key))
      || (filter === 'no_subscription' && row.situation.key === 'no_subscription');
    return matches && byFilter;
  });

  const steps = [
    { done: setup.payments === true, label: 'Conectar a Pagar.me', hint: 'Chave secreta e webhook', href: '/admin/pagamentos' },
    { done: setup.plans, label: 'Vincular os planos', hint: 'Preço mensal (e anual) de cada plano', href: '/admin/pagamentos' },
    { done: setup.ai === true, label: 'Conectar a IA', hint: 'Chave do provedor e modelo padrão', href: '/admin/ia' },
    { done: customers.length > 0, label: 'Cadastrar o primeiro cliente', hint: 'Ou divulgar o teste grátis no site', href: '#nova' },
  ];
  const stepsDone = steps.filter(step => step.done).length;

  const activity = useMemo(() => {
    const nameOf = (id: string | null) => orgs.find(org => org.id === id)?.name ?? 'Empresa';
    const items = [
      ...events.map(event => ({ id: event.id, at: event.received_at, text: `${nameOf(event.organization_id)} · ${EVENT_LABEL[event.type] ?? event.type}`, tone: event.type.includes('failed') || event.type.includes('canceled') ? 'bg-rose-500' : 'bg-emerald-500' })),
      ...customers.slice(0, 6).map(org => ({ id: `org-${org.id}`, at: org.created_at, text: `${org.name} · ${org.status === 'trial' ? 'começou o teste grátis' : 'foi cadastrada'}`, tone: 'bg-[#2F316B]' })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);
  }, [events, customers, orgs]);

  if (loading) return <AdminShell title="Visão geral"><SkeletonOverview /></AdminShell>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Esta área é exclusiva do Super Admin da plataforma.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return <AdminShell title="Visão geral" width="max-w-7xl" actions={<button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#1D1F4E] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-950/20 transition hover:bg-[#2F316B]"><Plus size={16} />Nova empresa</button>}>
    {error && <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

    <section className="relative overflow-hidden rounded-3xl bg-[#1D1F4E] p-6 text-white sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#CB0A9F]/35 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-[#00A3A3]/25 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-white/60">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}{firstName ? `, ${firstName}` : ''}.</h2>
          <p className="mt-2 max-w-xl text-sm text-white/70">{attention ? `${attention} ${attention === 1 ? 'cliente pede' : 'clientes pedem'} atenção hoje.` : trials ? `${trials} ${trials === 1 ? 'empresa está' : 'empresas estão'} testando o Tendi agora.` : 'Tudo em ordem na plataforma.'}</p>
        </div>
        <div className="flex gap-8">
          <div><p className="text-xs font-medium uppercase tracking-wider text-white/50">Receita mensal</p><p className="mt-1 text-3xl font-semibold tracking-tight">{brl(mrr)}</p><p className="text-xs text-white/50">{brl(mrr * 12)} por ano</p></div>
          <div className="hidden sm:block"><p className="text-xs font-medium uppercase tracking-wider text-white/50">Pagantes</p><p className="mt-1 text-3xl font-semibold tracking-tight">{paying}</p><p className="text-xs text-white/50">{conversion ? `${Math.round((paying / conversion) * 100)}% de conversão` : 'sem testes ainda'}</p></div>
        </div>
      </div>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Building2} label="Clientes" value={String(customers.length)} detail={`${paying} pagantes · ${trials} em teste`} accent="text-[#2F316B] bg-[#F1F1FB]" />
      <Kpi icon={AlertTriangle} label="Pedem atenção" value={String(attention)} detail="Pagamento pendente, teste vencido ou suspensas" accent={attention ? 'text-amber-700 bg-amber-50' : 'text-slate-400 bg-slate-50'} onClick={attention ? () => setFilter('attention') : undefined} />
      <Kpi icon={Sparkles} label="Custo de IA no mês" value={brl(aiCost)} detail={mrr ? `${((aiCost / mrr) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da receita mensal` : 'Sem receita para comparar'} accent="text-[#CB0A9F] bg-[#FDF0FA]" href="/admin/ia/consumo" />
      <Kpi icon={MessageSquare} label="Conversas" value={counts.conversations.toLocaleString('pt-BR')} detail={`${counts.contacts.toLocaleString('pt-BR')} contatos atendidos`} accent="text-[#004751] bg-[#E8F4F2]" />
    </section>

    <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[.03]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="mr-auto"><h2 className="text-[15px] font-semibold text-[#1D1F4E]">Empresas</h2><p className="text-xs text-slate-400">{customers.length} {customers.length === 1 ? 'cliente' : 'clientes'} na plataforma</p></div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm focus-within:border-[#7C7EC0] focus-within:bg-white"><Search size={15} className="text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar empresa" className="w-40 bg-transparent outline-none placeholder:text-slate-400" /></label>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2">{FILTERS.map(item => {
          const count = item.key === 'all' ? rows.length : rows.filter(row => item.key === 'attention' ? ['past_due', 'expired', 'suspended'].includes(row.situation.key) : row.situation.key === item.key).length;
          return <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={filter === item.key ? 'whitespace-nowrap rounded-lg bg-[#1D1F4E] px-3 py-1.5 text-xs font-semibold text-white' : 'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100'}>{item.label}<span className={filter === item.key ? 'ml-1.5 text-white/60' : 'ml-1.5 text-slate-400'}>{count}</span></button>;
        })}</div>
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50/60 text-[11px] font-medium uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-2.5 font-medium">Empresa</th><th className="py-2.5 font-medium">Plano</th><th className="py-2.5 font-medium">Situação</th><th className="py-2.5 font-medium">Equipe</th><th className="py-2.5 font-medium">IA no mês</th><th className="py-2.5 pr-5 text-right font-medium">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map(row => <tr key={row.org.id} className="group transition hover:bg-slate-50/70">
            <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ECECFA] to-[#FBEAF6] text-[11px] font-bold text-[#2F316B]">{initials(row.org.name)}</span><div className="min-w-0"><p className="truncate font-medium text-slate-800">{row.org.name}</p><p className="text-xs text-slate-400">desde {shortDate(row.org.created_at)}</p></div></div></td>
            <td className="py-3"><p className="text-slate-700">{row.plan?.name ?? '—'}</p><p className="text-xs text-slate-400">{row.monthly ? `${brl(row.monthly)}/mês${row.sub?.billing_period === 'annual' ? ' · anual' : ''}` : '—'}</p></td>
            <td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${row.situation.tone}`}>{row.situation.label}</span></td>
            <td className="py-3 text-slate-600"><span className="inline-flex items-center gap-1.5"><Users size={14} className="text-slate-400" />{row.members}</span></td>
            <td className="py-3 text-slate-600">{row.aiReplies ? <><p>{row.aiReplies.toLocaleString('pt-BR')} respostas</p><p className="text-xs text-slate-400">{brl(row.aiCost)}</p></> : <span className="text-slate-300">—</span>}</td>
            <td className="py-3 pr-5"><div className="flex justify-end gap-1.5"><a href={`/admin/organizations/${row.org.id}/setup`} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">Responsável</a><a href={`/inbox?organization=${row.org.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#004751] hover:border-[#004751]/40">Abrir<ArrowUpRight size={13} /></a></div></td>
          </tr>)}</tbody>
        </table></div> : <div className="px-6 py-14 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300"><Building2 size={22} /></span><p className="mt-3 text-sm font-medium text-slate-700">{customers.length ? 'Nenhuma empresa neste filtro' : 'Nenhum cliente ainda'}</p><p className="mt-1 text-xs text-slate-400">{customers.length ? 'Troque o filtro ou a busca.' : 'Cadastre o primeiro cliente ou divulgue o teste grátis do site.'}</p>{!customers.length && <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1D1F4E] px-3.5 py-2 text-sm font-semibold text-white"><Plus size={15} />Nova empresa</button>}</div>}
      </div>

      <div className="space-y-6">
        {stepsDone < steps.length && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[.03]">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-[#1D1F4E]">Pronto para vender</h2><span className="text-xs font-medium text-slate-400">{stepsDone} de {steps.length}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-[#004751] to-[#00A3A3] transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>
          <ul className="mt-4 space-y-1">{steps.map(step => <li key={step.label}><a href={step.href} onClick={step.href === '#nova' ? event => { event.preventDefault(); setCreating(true); } : undefined} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
            <span className={step.done ? 'flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white' : 'flex size-6 items-center justify-center rounded-full border-2 border-slate-200'}>{step.done && <Check size={13} strokeWidth={3} />}</span>
            <span className="min-w-0 flex-1"><span className={step.done ? 'block text-sm text-slate-400 line-through' : 'block text-sm font-medium text-slate-700'}>{step.label}</span>{!step.done && <span className="block text-[11px] text-slate-400">{step.hint}</span>}</span>
            {!step.done && <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />}
          </a></li>)}</ul>
        </section>}

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[.03]">
          <h2 className="text-[15px] font-semibold text-[#1D1F4E]">Funil de clientes</h2>
          <div className="mt-4 space-y-3">{[
            { label: 'Em teste', value: trials, color: 'bg-sky-500', icon: Clock3 },
            { label: 'Pagantes', value: paying, color: 'bg-emerald-500', icon: CircleDollarSign },
            { label: 'Pedem atenção', value: attention, color: 'bg-amber-500', icon: AlertTriangle },
          ].map(item => { const Icon = item.icon; const max = Math.max(1, trials, paying, attention); return <div key={item.label}>
            <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><Icon size={14} className="text-slate-400" />{item.label}</span><span className="font-semibold text-slate-800">{item.value}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / max) * 100}%` }} /></div>
          </div>; })}</div>
          <a href="/admin/pagamentos" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#004751] hover:underline"><CreditCard size={13} />Ver assinaturas</a>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[.03]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#1D1F4E]"><TrendingUp size={16} className="text-slate-400" />Atividade recente</h2>
          {activity.length ? <ol className="mt-4 space-y-3.5">{activity.map(item => <li key={item.id} className="flex gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.tone}`} /><div className="min-w-0"><p className="text-[13px] leading-5 text-slate-700">{item.text}</p><p className="text-[11px] text-slate-400">{new Date(item.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div></li>)}</ol> : <p className="mt-3 text-xs text-slate-400">Os cadastros e pagamentos aparecem aqui.</p>}
        </section>
      </div>
    </section>

    {creating && <NewCompanyDialog onClose={() => { setCreating(false); if (window.location.search.includes('nova=1')) window.history.replaceState(null, '', '/admin'); }} onCreated={() => void load()} />}
  </AdminShell>;
}

function Kpi({ icon: Icon, label, value, detail, accent, href, onClick }: { icon: typeof Building2; label: string; value: string; detail: string; accent: string; href?: string; onClick?: () => void }) {
  const body = <>
    <div className="flex items-center justify-between"><p className="text-[13px] font-medium text-slate-500">{label}</p><span className={`rounded-lg p-2 ${accent}`}><Icon size={16} /></span></div>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-[#1D1F4E]">{value}</p>
    <p className="mt-1 text-xs text-slate-400">{detail}</p>
  </>;
  const cls = 'block rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm shadow-slate-900/[.03] transition';
  if (href) return <a href={href} className={`${cls} hover:-translate-y-0.5 hover:shadow-md`}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} hover:-translate-y-0.5 hover:shadow-md`}>{body}</button>;
  return <article className={cls}>{body}</article>;
}

function SkeletonOverview() {
  return <div className="animate-pulse space-y-6">
    <div className="h-40 rounded-3xl bg-slate-200/70" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-200/60" />)}</div>
    <div className="h-72 rounded-2xl bg-slate-200/50" />
  </div>;
}

function NewCompanyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) return;
    setSaving(true); setError('');
    const supabase = createClient() as any;
    try {
      const baseSlug = cleanName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: organization, error: orgError } = await supabase.from('organizations')
        .insert({ name: cleanName, slug, status: 'active', plan_code: 'tendi_start' })
        .select('id,name').single();
      if (orgError) throw orgError;
      const { error: teamError } = await supabase.from('teams').insert({ organization_id: organization.id, name: 'Atendimento', description: 'Equipe principal de atendimento', color: '#004751' });
      if (teamError) throw teamError;
      const { data: pipeline, error: pipelineError } = await supabase.from('crm_pipelines').insert({ organization_id: organization.id, name: 'Vendas', is_default: true }).select('id').single();
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
      setCreated(organization);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 p-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="new-company-title" onMouseDown={event => event.stopPropagation()} className="animate-pop w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20">
      <div className="flex items-start justify-between"><div><h2 id="new-company-title" className="text-lg font-semibold text-[#1D1F4E]">{created ? 'Empresa criada' : 'Nova empresa'}</h2><p className="mt-1 text-sm text-slate-500">{created ? 'Agora convide o responsável para ele assumir o workspace.' : 'O workspace já nasce com equipe de atendimento e funil de vendas.'}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
      {created ? <div className="mt-5 space-y-3">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} />{created.name} está pronta.</div>
        <a href={`/admin/organizations/${created.id}/setup`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D1F4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2F316B]">Convidar o responsável<ArrowRight size={15} /></a>
        <a href={`/inbox?organization=${created.id}`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Abrir o workspace</a>
      </div> : <form onSubmit={submit} className="mt-5">
        <label htmlFor="company-name" className="text-sm font-medium text-slate-700">Nome da empresa</label>
        <input id="company-name" autoFocus required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Clínica Sorriso" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#7C7EC0] focus:ring-4 focus:ring-[#2F316B]/5" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={saving || name.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-[#1D1F4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2F316B] disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Criar empresa</button></div>
      </form>}
    </div>
  </div>;
}
