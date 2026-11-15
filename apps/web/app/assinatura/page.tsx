'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Check, CheckCircle2, Clock3, CreditCard, Gift, Loader2, Lock, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isOrganizationBlocked, trialDaysLabel, trialDaysLeft } from '@/lib/trial';
import { complimentaryDaysLeft, isComplimentaryActive, isComplimentaryExpired } from '@/lib/complimentary';
import { annualDiscountPercent, type BillingPeriod } from '@/lib/billing-format';

type Org = { id: string; name: string; status: string; plan_code: string | null; trial_ends_at: string | null; complimentary_since?: string | null; complimentary_until?: string | null };
type Plan = { code: string; name: string; description: string; max_attendants: number; max_teams: number | null; ai_enabled: boolean; monthly_price: number | null; pagarme_plan_id: string | null; annual_price: number | null; pagarme_annual_plan_id: string | null };
type Subscription = { status: 'active' | 'past_due' | 'canceled'; plan_code: string | null; billing_period: 'monthly' | 'annual' | null; next_billing_at: string | null; current_period_end: string | null; card_brand: string | null; card_last_digits: string | null };

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
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [changeTo, setChangeTo] = useState('');
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSubscription = useCallback(async (organizationId: string) => {
    const supabase = createClient() as any;
    const [{ data: sub }, { data: org }] = await Promise.all([
      supabase.from('billing_subscriptions').select('status,plan_code,billing_period,next_billing_at,current_period_end,card_brand,card_last_digits').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('organizations').select('id,name,status,plan_code,trial_ends_at,complimentary_since,complimentary_until').eq('id', organizationId).maybeSingle(),
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
        supabase.from('organizations').select('id,name,status,plan_code,trial_ends_at,complimentary_since,complimentary_until').order('name'),
        supabase.from('subscription_plans').select('code,name,description,max_attendants,max_teams,ai_enabled,monthly_price,pagarme_plan_id,annual_price,pagarme_annual_plan_id').eq('is_active', true).order('display_order'),
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
    const response = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: orgId, planCode, period }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data?.url) { window.location.assign(data.url); return; }
    setBusyPlan('');
    setError(data?.error ?? 'Não foi possível abrir o pagamento.');
  }

  async function changePlan(planCode: string) {
    setChanging(true); setError(''); setNotice('');
    const response = await fetch('/api/billing/change-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId: orgId, planCode }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setChanging(false);
    if (!response?.ok || !data?.ok) { setError(data?.error ?? 'Não foi possível trocar o plano.'); return; }
    const name = plans.find(plan => plan.code === planCode)?.name ?? 'novo plano';
    setChangeTo('');
    setNotice(data.direction === 'upgrade'
      ? `Pronto! O ${name} já está liberado. A partir de ${date(data.startsAt)}, a cobrança será de ${money(Number(data.price))}/${data.billingPeriod === 'annual' ? 'ano' : 'mês'}.`
      : `Troca agendada. Você continua no plano atual até ${date(data.startsAt)}; depois passa para o ${name} por ${money(Number(data.price))}/${data.billingPeriod === 'annual' ? 'ano' : 'mês'}.`);
    await loadSubscription(orgId);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-tendi-haze text-tendi-indigo"><Loader2 className="animate-spin" /></main>;

  const org = orgs.find(item => item.id === orgId) ?? null;
  const blocked = org ? isOrganizationBlocked(org) : false;
  const daysLeft = org ? trialDaysLeft(org) : null;
  const complimentary = org ? isComplimentaryActive(org) : false;
  const complimentaryDays = complimentary ? complimentaryDaysLeft(org) : null;
  const hasSubscription = Boolean(subscription && subscription.status !== 'canceled');
  // Numa descida agendada, a empresa continua no plano atual (organizations.plan_code) até a próxima cobrança.
  const billedPlan = plans.find(plan => plan.code === subscription?.plan_code);
  const currentPlan = plans.find(plan => plan.code === org?.plan_code) ?? billedPlan;
  const scheduledPlan = billedPlan && currentPlan && billedPlan.code !== currentPlan.code ? billedPlan : null;
  const subPeriod: BillingPeriod = subscription?.billing_period === 'annual' ? 'annual' : 'monthly';
  const priceOf = (plan: Plan | undefined) => Number((subPeriod === 'annual' ? plan?.annual_price : plan?.monthly_price) ?? 0);
  const switchable = (plan: Plan) => Boolean(priceOf(plan) && (subPeriod === 'annual' ? plan.pagarme_annual_plan_id : plan.pagarme_plan_id));
  const otherPlans = plans.filter(plan => plan.code !== subscription?.plan_code);
  const unit = subPeriod === 'annual' ? 'ano' : 'mês';
  const card = subscription?.card_last_digits ? `${subscription.card_brand ?? 'cartão'} •••• ${subscription.card_last_digits}` : 'cartão cadastrado';
  // O seletor Mensal/Anual só aparece quando algum plano tem a versão anual vinculada.
  const hasAnnual = plans.some(plan => plan.annual_price && plan.pagarme_annual_plan_id);
  const bestDiscount = Math.max(0, ...plans.map(plan => annualDiscountPercent(plan.monthly_price, plan.annual_price) ?? 0)) || null;

  return <main className="min-h-screen bg-tendi-haze text-slate-800">
    <header className="sticky top-0 z-20 border-b border-tendi-line/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
      <img src="/brand/tendidesk-logo.png" alt="TendiDesk" width="1291" height="640" className="h-10 w-auto object-contain" />
      <div className="flex items-center gap-4">
        {!blocked && <Link href="/inbox" className="td-btn td-btn-secondary td-btn-sm"><ArrowLeft size={14} /> Voltar ao Inbox</Link>}
        <form action="/auth/signout" method="post"><button className="td-btn td-btn-ghost td-btn-sm">Sair</button></form>
      </div>
    </div></header>

    <div className="mx-auto max-w-5xl animate-fade-up px-4 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-8 sm:px-6 sm:pt-12">
      <p className="td-eyebrow !text-tendi-magenta">Assinatura</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-tendi-navy sm:text-[32px]">{hasSubscription ? 'Sua assinatura' : blocked ? 'Escolha um plano para continuar' : 'Escolha seu plano'}</h1>
      {orgs.length > 1 && <label className="mt-4 block max-w-xs text-xs font-semibold text-slate-500">Workspace<select value={orgId} onChange={e => { setOrgId(e.target.value); void loadSubscription(e.target.value); }} className="td-input mt-1">{orgs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}

      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {confirming && !hasSubscription && <div role="status" className="mt-6 flex items-center gap-3 rounded-2xl border border-tendi-indigo/10 bg-white p-5 shadow-card"><Loader2 className="animate-spin text-tendi-teal" size={22} /><div><p className="font-semibold text-tendi-navy">Confirmando seu pagamento…</p><p className="text-sm text-slate-500">A Pagar.me avisa o TendiDesk em alguns segundos. Pode deixar esta página aberta.</p></div></div>}

      {!hasSubscription && !confirming && blocked && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><Lock className="mt-0.5 shrink-0 text-amber-600" size={20} /><div><p className="font-semibold text-amber-900">{org?.status === 'suspended' ? 'O acesso deste workspace está pausado' : isComplimentaryExpired(org) ? 'Sua conta cortesia terminou' : 'Seu teste gratuito terminou'}</p><p className="mt-1 text-sm text-amber-800">Suas conversas, contatos e configurações continuam guardados. Assine um plano para voltar a usar o TendiDesk na hora.</p></div></div>}
      {!hasSubscription && complimentary && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E9D5F5] bg-[#FBF5FE] p-5"><Gift className="mt-0.5 shrink-0 text-tendi-magenta" size={20} /><div><p className="font-semibold text-tendi-navy">Conta cortesia</p><p className="mt-1 text-sm text-slate-600">A equipe TendiDesk liberou este workspace sem cobrança{complimentaryDays === null ? '.' : complimentaryDays === 0 ? ', até hoje.' : `, por mais ${complimentaryDays} ${complimentaryDays === 1 ? 'dia' : 'dias'}.`} Você não precisa assinar agora.</p></div></div>}
      {!hasSubscription && !complimentary && !blocked && daysLeft !== null && <div className="mt-6 flex items-center gap-3 td-card p-5"><Clock3 className="text-amber-600" size={20} /><p className="text-sm text-slate-600">{daysLeft === 0 ? 'Seu teste termina hoje.' : `Faltam ${trialDaysLabel(daysLeft)} de teste gratuito.`} Assine agora e não perca o acesso.</p></div>}

      {hasSubscription && subscription && <section className="mt-6 td-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          {subscription.status === 'active' ? <CheckCircle2 className="text-emerald-600" size={24} /> : <AlertTriangle className="text-amber-600" size={24} />}
          <div><p className="text-lg font-semibold tracking-tight text-tendi-navy">{currentPlan?.name ?? 'Plano TendiDesk'}{subscription.billing_period === 'annual'
            ? (currentPlan?.annual_price ? ` Anual · ${money(Number(currentPlan.annual_price))}/ano` : ' Anual')
            : (currentPlan?.monthly_price ? ` · ${money(Number(currentPlan.monthly_price))}/mês` : '')}</p>
            <p className={subscription.status === 'active' ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-700'}>{subscription.status === 'active' ? 'Assinatura ativa' : 'Pagamento pendente'}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info label="Próxima cobrança" value={date(subscription.next_billing_at)} />
          <Info label="Cartão" value={subscription.card_last_digits ? `${subscription.card_brand ?? 'Cartão'} •••• ${subscription.card_last_digits}` : '—'} />
        </div>
        {subscription.status === 'past_due' && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Não conseguimos cobrar o seu cartão. A Pagar.me vai tentar de novo nos próximos dias; se o cartão mudou, fale com o suporte em suporte@tendidesk.com.br para atualizar.</p>}
        {scheduledPlan && <p className="mt-4 flex items-start gap-2 rounded-xl bg-tendi-haze p-3 text-sm text-slate-600"><Clock3 size={16} className="mt-0.5 shrink-0 text-tendi-indigo" />Troca agendada: a partir de {date(subscription.next_billing_at)} você passa para o {scheduledPlan.name}, por {money(priceOf(scheduledPlan))}/{unit}.</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        {subscription.status === 'active' && otherPlans.length > 0 && <div className="mt-6 border-t border-tendi-line/70 pt-5">
          <p className="text-sm font-semibold text-tendi-navy">Trocar de plano</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {otherPlans.map(plan => {
              const price = priceOf(plan);
              const upgrade = price >= priceOf(billedPlan);
              const open = changeTo === plan.code;
              return <div key={plan.code} className="td-subtle p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-tendi-navy">{plan.name}{subPeriod === 'annual' ? ' Anual' : ''}</p>
                    <p className="text-sm text-slate-500">{price ? `${money(price)}/${unit}` : 'Indisponível'} · até {plan.max_attendants} atendentes{plan.ai_enabled ? ' · Agente de IA' : ''}</p></div>
                  {!open && <button type="button" disabled={!switchable(plan) || changing} onClick={() => { setChangeTo(plan.code); setError(''); setNotice(''); }} className="td-btn td-btn-secondary td-btn-sm shrink-0">{plan.code === currentPlan?.code ? 'Manter este plano' : upgrade ? 'Fazer upgrade' : 'Mudar para este'}</button>}
                </div>
                {open && <div className="mt-3 rounded-xl border border-tendi-indigo/10 bg-white p-3 text-sm text-slate-600">
                  {plan.code === currentPlan?.code
                    ? <p>A troca agendada é desfeita e você continua no <b>{plan.name}</b>. A partir de <b>{date(subscription.next_billing_at)}</b>, o {card} segue sendo cobrado <b>{money(price)}/{unit}</b>.</p>
                    : upgrade
                    ? <p>O <b>{plan.name}</b> libera <b>agora</b>. Hoje não há cobrança extra. A partir de <b>{date(subscription.next_billing_at)}</b>, o {card} passa a ser cobrado <b>{money(price)}/{unit}</b>.</p>
                    : <p>Você continua no <b>{currentPlan?.name ?? 'plano atual'}</b> até <b>{date(subscription.next_billing_at)}</b>. A partir daí, o {card} passa a ser cobrado <b>{money(price)}/{unit}</b> e os recursos que não fazem parte do {plan.name} deixam de valer. Não há reembolso do período já pago.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={changing} onClick={() => void changePlan(plan.code)} className="td-btn td-btn-teal td-btn-sm">{changing && <Loader2 size={14} className="animate-spin" />}Confirmar troca para {money(price)}/{unit}</button>
                    <button type="button" disabled={changing} onClick={() => setChangeTo('')} className="td-btn td-btn-ghost td-btn-sm">Cancelar</button>
                  </div>
                </div>}
              </div>;
            })}
          </div>
        </div>}
        <p className="mt-4 text-xs text-slate-400">Para cancelar a assinatura, fale com o suporte em suporte@tendidesk.com.br.</p>
      </section>}

      {!hasSubscription && hasAnnual && <div role="radiogroup" aria-label="Período de cobrança" className="td-tabs mt-8">
        {(['monthly', 'annual'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={period === value} onClick={() => setPeriod(value)} className={period === value ? 'td-tab td-tab-active h-9 px-4 text-[13px]' : 'td-tab h-9 px-4 text-[13px]'}>
          {value === 'monthly' ? 'Mensal' : <>Anual{bestDiscount ? <span className={period === value ? 'ml-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700' : 'ml-1.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700'}>{bestDiscount}% off</span> : null}</>}
        </button>)}
      </div>}

      {!hasSubscription && <section className={hasAnnual ? 'mt-5 grid gap-5 md:grid-cols-2' : 'mt-8 grid gap-5 md:grid-cols-2'}>
        {plans.map(plan => {
          const annual = period === 'annual';
          const price = annual ? plan.annual_price : plan.monthly_price;
          const available = Boolean(price && (annual ? plan.pagarme_annual_plan_id : plan.pagarme_plan_id));
          const discount = annualDiscountPercent(plan.monthly_price, plan.annual_price);
          return <article key={plan.code} className="td-card td-card-hover relative flex flex-col overflow-hidden p-6 sm:p-7"><span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-tendi-indigo via-tendi-lilac to-tendi-magenta opacity-80" />
            <h2 className="text-xl font-semibold tracking-tight text-tendi-navy">{plan.name}{annual ? ' Anual' : ''}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>
            {annual && price && plan.monthly_price
              ? <div className="mt-4">
                  <p className="text-[34px] font-semibold tracking-tight tabular-nums text-tendi-navy">{money(Number(price) / 12)}<span className="text-sm font-medium text-slate-400"> /mês</span></p>
                  <p className="mt-1 text-sm text-slate-500"><span className="text-slate-400 line-through">{money(Number(plan.monthly_price))}</span> · {money(Number(price))} cobrados uma vez por ano</p>
                  {discount && <p className="mt-1 text-sm font-semibold text-emerald-700">Economia de {money(Number(plan.monthly_price) * 12 - Number(price))} por ano ({discount}% off)</p>}
                </div>
              : <p className="mt-4 text-[34px] font-semibold tracking-tight tabular-nums text-tendi-navy">{price ? money(Number(price)) : 'Em breve'}{price ? <span className="text-sm font-medium text-slate-400"> /{annual ? 'ano' : 'mês'}</span> : null}</p>}
            <ul className="mb-7 mt-6 space-y-3 border-t border-tendi-line/70 pt-5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Users size={16} className="text-tendi-teal" /> Até {plan.max_attendants} atendentes</li>
              {plan.max_teams !== null && <li className="flex items-center gap-2"><Check size={16} className="text-tendi-teal" /> Até {plan.max_teams} setores</li>}
              {plan.ai_enabled && <li className="flex items-center gap-2"><Bot size={16} className="text-tendi-teal" /> Agente de IA no WhatsApp</li>}
              <li className="flex items-center gap-2"><CreditCard size={16} className="text-tendi-teal" /> {period === 'annual' ? 'Cobrança anual à vista no cartão de crédito' : 'Cobrança mensal no cartão de crédito'}</li>
            </ul>
            <button type="button" disabled={!available || busyPlan !== '' || !orgId} onClick={() => void subscribe(plan.code)} className="td-btn td-btn-teal mt-auto h-11 w-full">{busyPlan === plan.code && <Loader2 size={16} className="animate-spin" />}{available ? `Assinar ${plan.name}` : 'Indisponível no momento'}</button>
          </article>;
        })}
        {!plans.length && <p className="text-sm text-slate-500">Nenhum plano disponível no momento. Fale com o suporte em suporte@tendidesk.com.br.</p>}
      </section>}

      <p className="mt-8 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={14} /> Pagamento processado pela Pagar.me. O TendiDesk não armazena dados do seu cartão.</p>
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="td-subtle p-3"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-700">{value}</p></div>;
}
