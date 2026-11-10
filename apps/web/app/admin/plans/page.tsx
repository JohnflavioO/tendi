'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Building2, Check, Clock3, CreditCard, FileText, Loader2, Plug, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Plan = {
  id: string; code: string; name: string; description: string;
  max_attendants: number; max_teams: number | null;
  ai_enabled: boolean; boleto_second_copy_enabled: boolean;
  integrations: string[]; monthly_price: number | null; is_active: boolean;
};

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trialDays, setTrialDays] = useState(7);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!admin) { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);
      const { data, error: queryError } = await supabase.from('subscription_plans')
        .select('id,code,name,description,max_attendants,max_teams,ai_enabled,boleto_second_copy_enabled,integrations,monthly_price,is_active')
        .order('display_order', { ascending: true });
      if (queryError) setError('O catálogo de planos ainda não está disponível. A migration desta etapa precisa ser aplicada.');
      setPlans((data ?? []) as Plan[]);
      const { data: setting } = await supabase.from('platform_settings').select('value').eq('key', 'trial_days').maybeSingle();
      if (setting?.value !== undefined) {
        const parsed = Number(setting.value);
        if (Number.isFinite(parsed) && parsed > 0) setTrialDays(parsed);
      }
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28}/></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32}/><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const features = (plan: Plan) => [
    { icon: Users, label: plan.max_attendants + ' atendentes', enabled: true },
    { icon: Building2, label: plan.max_teams === null ? 'Setores: definição pendente' : plan.max_teams + ' setores', enabled: plan.max_teams !== null },
    { icon: Bot, label: 'Inteligência artificial', enabled: plan.ai_enabled },
    { icon: FileText, label: 'Segunda via de boleto', enabled: plan.boleto_second_copy_enabled },
    { icon: Plug, label: plan.integrations.length ? plan.integrations.length + ' integrações configuradas' : 'Integrações adicionais sob definição', enabled: plan.integrations.length > 0 },
  ];

  return <main className="min-h-screen bg-[#F6F7FB] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain"/><div className="border-l border-slate-200 pl-3"><p className="text-xs font-semibold text-[#2F316B]">Console</p><p className="text-xs text-slate-500">Planos e recursos</p></div></div>
      <a href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#004751]"><ArrowLeft size={16}/> Voltar ao painel</a>
    </div></header>
    <div className="mx-auto max-w-6xl px-6 py-9">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Gestão comercial</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#25275B]">Planos e recursos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Defina o que cada assinatura libera. Os valores comerciais ainda não foram cadastrados e permanecem em aberto.</p></div>
      <section className="mt-7 flex flex-wrap items-center gap-4 rounded-2xl border border-[#2F316B]/10 bg-white p-5 shadow-sm"><span className="rounded-xl bg-amber-50 p-3 text-amber-600"><Clock3 size={22}/></span><div><p className="font-semibold text-[#25275B]">Período de teste gratuito</p><p className="mt-1 text-sm text-slate-500">Prazo padrão configurado para novos cadastros.</p></div><div className="ml-auto text-right"><p className="text-2xl font-bold text-[#25275B]">{trialDays} dias</p><p className="text-xs text-slate-400">Sem cartão no cadastro</p></div></section>
      {error && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}
      <section className="mt-7 grid gap-5 lg:grid-cols-2">{plans.map((plan, index) => <article key={plan.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6"><div className="flex items-center justify-between"><span className="rounded-lg bg-[#F0F1FA] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#2F316B]">{index === 0 ? 'Plano inicial' : 'Plano avançado'}</span><span className={plan.is_active ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700' : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500'}>{plan.is_active ? 'Disponível' : 'Inativo'}</span></div><h2 className="mt-4 text-2xl font-bold text-[#25275B]">{plan.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p><div className="mt-4 flex items-end gap-2"><span className="text-2xl font-bold text-[#25275B]">Valor a definir</span><span className="pb-1 text-xs text-slate-400">/ mensal</span></div></div>
        <div className="space-y-4 p-6"><h3 className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Recursos incluídos</h3>{features(plan).map((feature, i) => { const Icon = feature.icon; return <div key={i} className="flex items-center gap-3 text-sm"><span className={feature.enabled ? 'rounded-lg bg-emerald-50 p-2 text-emerald-700' : 'rounded-lg bg-slate-100 p-2 text-slate-400'}><Icon size={17}/></span><span className={feature.enabled ? 'font-medium text-slate-700' : 'text-slate-400'}>{feature.label}</span>{feature.enabled && <Check className="ml-auto text-emerald-600" size={16}/>}</div>;})}</div>
      </article>)}</section>
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5"><div className="flex items-start gap-3"><CreditCard className="mt-0.5 text-slate-400" size={19}/><div><p className="text-sm font-semibold text-slate-700">Cobrança ainda não ativada</p><p className="mt-1 text-xs leading-5 text-slate-500">Os preços e meios de pagamento serão definidos em uma etapa própria. Nenhuma cobrança ou assinatura é criada por esta tela.</p></div></div></div>
    </div>
  </main>;
}
