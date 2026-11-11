'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Check, CheckCircle2, Clock3, CreditCard, Loader2, Lock, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isOrganizationBlocked, trialDaysLabel, trialDaysLeft } from '@/lib/trial';

type Org = { id: string; name: string; status: string; plan_code: string | null; trial_ends_at: string | null };
type Plan = { code: string; name: string; description: string; max_attendants: number; max_teams: number | null; ai_enabled: boolean; monthly_price: number | null; pagarme_plan_id: string | null };
type Subscription = { status: 'active' | 'past_due' | 'canceled'; plan_code: string | null; next_billing_at: string | null; current_period_end: string | null; card_brand: string | null; card_last_digits: string | null };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const loadSubscription = useCallback(async (organizationId: string) => {
    const supabase = createClient() as any;
    const [{ data: sub }, { data: org }] = await Promise.all([
      supabase.from('billing_subscriptions').select('status,plan_code,next_billing_at,current_period_end,card_brand,card_last_digits').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('organizations').select('id,name,status,plan_code,trial_ends_at').eq('id', organizationId).maybeSingle(),
    ]);
    setSubscription((sub ?? null) as Subscription | null);
    if (org) setOrgs(current => current.map(item => (item.id === org.id ? org : item)));
    return (sub ?? null) as Subscription | null;
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const [{ data: orgList }, { data: planList }] = await Promise.all([
        supabase.from('organizations').select('id,name,status,plan_code,trial_ends_at').order('name'),
        supabase.from('subscription_plans').select('code,name,description,max_attendants,max_teams,ai_enabled,monthly_price,pagarme_plan_id').eq('is_active', true).order('display_order'),
      ]);
      const list = (orgList ?? []) as Org[];
      setOrgs(list);
      setPlans((planList ?? []) as Plan[]);
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('organization');
      const selected = list.find(org => org.id === requested)?.id ?? list[0]?.id ?? '';
      setOrgId(selected);
      if (selected) await loadSubscription(selected);
      setConfirming(params.get('checkout') === 'concluido');
      setLoading(false);
    }
    void load().catch(err => { setError(err instanceof Error ? err.message : 'Falha ao carregar.'); setLoading(false); });
  }, [loadSubscription]);

  // Voltou do checkout: a confirmação chega pelo webhook em alguns segundos.
  useEffect(() => {
    if (!confirming || !orgId) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const sub = await loadSubscription(orgId).catch(() => null);
      if ((sub && sub.status !== 'canceled') || tries >= 30) { clearInterval(timer); setConfirming(false); }
    }, 3000);
    return () => clearInterval(timer);
  }, [confirming, orgId, loadSubscription]);

  async function subscribe(planCode: string) {
    setBusyPlan(planCode); setError('');
    const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: orgId, planCode }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data?.url) { window.location.assign(data.url); return; }
    setBusyPlan('');
    setError(data?.error ?? 'Não foi possível abrir o pagamento.');
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;

  const org = orgs.find(item => item.id === orgId) ?? null;
  const blocked = org ? isOrganizationBlocked(org) : false;
  const daysLeft = org ? trialDaysLeft(org) : null;
  const hasSubscription = Boolean(subscription && subscription.status !== 'canceled');
  const currentPlan = plans.find(plan => plan.code === subscription?.plan_code);

  return <main className="min-h-screen bg-[#F5F6FB] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain" />
      <div className="flex items-center gap-4">
        {!blocked && <a href="/inbox" className="inline-flex items-center gap-2 text-sm font-semibold text-[#004751]"><ArrowLeft size={16} /> Voltar ao Inbox</a>}
        <form action="/auth/signout" method="post"><button className="text-sm text-slate-500 hover:text-slate-700">Sair</button></form>
      </div>
    </div></header>

    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Assinatura</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#25275B]">{hasSubscription ? 'Sua assinatura' : blocked ? 'Escolha um plano para continuar' : 'Escolha seu plano'}</h1>
      {orgs.length > 1 && <label className="mt-4 block max-w-xs text-xs font-semibold text-slate-500">Workspace<select value={orgId} onChange={e => { setOrgId(e.target.value); void loadSubscription(e.target.value); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-[#2F316B]">{orgs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}

      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {confirming && !hasSubscription && <div role="status" className="mt-6 flex items-center gap-3 rounded-2xl border border-[#2F316B]/10 bg-white p-5 shadow-sm"><Loader2 className="animate-spin text-[#004751]" size={22} /><div><p className="font-semibold text-[#25275B]">Confirmando seu pagamento…</p><p className="text-sm text-slate-500">A Pagar.me avisa o Tendi em alguns segundos. Pode deixar esta página aberta.</p></div></div>}

      {!hasSubscription && !confirming && blocked && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><Lock className="mt-0.5 shrink-0 text-amber-600" size={20} /><div><p className="font-semibold text-amber-900">{org?.status === 'suspended' ? 'O acesso deste workspace está pausado' : 'Seu teste gratuito terminou'}</p><p className="mt-1 text-sm text-amber-800">Suas conversas, contatos e configurações continuam guardados. Assine um plano para voltar a usar o Tendi na hora.</p></div></div>}
      {!hasSubscription && !blocked && daysLeft !== null && <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5"><Clock3 className="text-amber-600" size={20} /><p className="text-sm text-slate-600">{daysLeft === 0 ? 'Seu teste termina hoje.' : `Faltam ${trialDaysLabel(daysLeft)} de teste gratuito.`} Assine agora e não perca o acesso.</p></div>}

      {hasSubscription && subscription && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {subscription.status === 'active' ? <CheckCircle2 className="text-emerald-600" size={24} /> : <AlertTriangle className="text-amber-600" size={24} />}
          <div><p className="text-lg font-bold text-[#25275B]">{currentPlan?.name ?? 'Plano Tendi'}{currentPlan?.monthly_price ? ` · ${money(Number(currentPlan.monthly_price))}/mês` : ''}</p>
            <p className={subscription.status === 'active' ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-700'}>{subscription.status === 'active' ? 'Assinatura ativa' : 'Pagamento pendente'}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info label="Próxima cobrança" value={date(subscription.next_billing_at)} />
          <Info label="Cartão" value={subscription.card_last_digits ? `${subscription.card_brand ?? 'Cartão'} •••• ${subscription.card_last_digits}` : '—'} />
        </div>
        {subscription.status === 'past_due' && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Não conseguimos cobrar o seu cartão. A Pagar.me vai tentar de novo nos próximos dias; se o cartão mudou, fale com o suporte em suporte@tendi.app para atualizar.</p>}
        <p className="mt-4 text-xs text-slate-400">Para trocar de plano ou cancelar, fale com o suporte em suporte@tendi.app.</p>
      </section>}

      {!hasSubscription && <section className="mt-8 grid gap-5 md:grid-cols-2">
        {plans.map(plan => {
          const available = Boolean(plan.monthly_price && plan.pagarme_plan_id);
          return <article key={plan.code} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#25275B]">{plan.name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>
            <p className="mt-4 text-3xl font-bold text-[#25275B]">{plan.monthly_price ? money(Number(plan.monthly_price)) : 'Em breve'}{plan.monthly_price ? <span className="text-sm font-medium text-slate-400"> /mês</span> : null}</p>
            <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Users size={16} className="text-[#004751]" /> Até {plan.max_attendants} atendentes</li>
              {plan.max_teams !== null && <li className="flex items-center gap-2"><Check size={16} className="text-[#004751]" /> Até {plan.max_teams} setores</li>}
              {plan.ai_enabled && <li className="flex items-center gap-2"><Bot size={16} className="text-[#004751]" /> Agente de IA no WhatsApp</li>}
              <li className="flex items-center gap-2"><CreditCard size={16} className="text-[#004751]" /> Cobrança mensal no cartão de crédito</li>
            </ul>
            <button type="button" disabled={!available || busyPlan !== '' || !orgId} onClick={() => void subscribe(plan.code)} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#003943] disabled:opacity-50">{busyPlan === plan.code && <Loader2 size={16} className="animate-spin" />}{available ? `Assinar ${plan.name}` : 'Indisponível no momento'}</button>
          </article>;
        })}
        {!plans.length && <p className="text-sm text-slate-500">Nenhum plano disponível no momento. Fale com o suporte em suporte@tendi.app.</p>}
      </section>}

      <p className="mt-8 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={14} /> Pagamento processado pela Pagar.me. O Tendi não armazena dados do seu cartão.</p>
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#FAFBFD] p-3"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>;
}
