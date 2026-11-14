'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CreditCard, ShieldCheck } from 'lucide-react';
import { annualOffer, type PublicPlan } from '@/lib/public-plans';
import { comparisonRows, fallbackCopy, planCopy, planFeatures } from '@/content/marketing/plans';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Planos do site com seletor Mensal | Anual. Preços e limites vêm do banco (revalidados a cada 5 min). */
export function Pricing({ plans, trialLabel }: { plans: PublicPlan[]; trialLabel: string }) {
  const offers = plans.map(annualOffer);
  const hasAnnual = offers.some(Boolean);
  const bestPercent = Math.max(0, ...offers.map(offer => offer?.percent ?? 0));
  const [annual, setAnnual] = useState(false);
  const rows = comparisonRows(plans);

  return <>
    {hasAnnual && <div className="mt-10 flex justify-center">
      <div role="radiogroup" aria-label="Período de cobrança" className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {[false, true].map(value => <button key={String(value)} type="button" role="radio" aria-checked={annual === value} onClick={() => setAnnual(value)} className={annual === value ? 'rounded-xl bg-[#25275B] px-5 py-2.5 text-sm font-bold text-white shadow' : 'rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-[#25275B]'}>
          {value ? <>Anual{bestPercent > 0 && <span className={annual ? 'ml-2 rounded-md bg-white/20 px-1.5 py-0.5 text-[11px]' : 'ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700'}>{bestPercent}% off</span>}</> : 'Mensal'}
        </button>)}
      </div>
    </div>}

    <div className={`mx-auto grid max-w-4xl items-stretch gap-5 md:grid-cols-2 ${hasAnnual ? 'mt-8' : 'mt-12'}`}>
      {plans.map((plan, index) => {
        const copy = planCopy[plan.code] ?? fallbackCopy;
        const offer = offers[index];
        const showAnnual = annual && offer;
        return <article key={plan.code} className={`relative flex flex-col overflow-hidden rounded-3xl bg-white ${copy.featured ? 'border-2 border-[#004751] shadow-xl shadow-[#004751]/10' : 'border border-slate-200 shadow-sm'}`}>
          {copy.featured && <div className="bg-[#004751] px-6 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">{'ribbon' in copy && copy.ribbon ? copy.ribbon : 'Recomendado'}</div>}
          <div className="flex flex-1 flex-col p-7 md:p-8">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">{copy.label}</p>
            <h3 className="mt-3 text-2xl font-extrabold text-[#25275B]">{plan.name}</h3>
            <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{copy.description}</p>

            <div className="mt-6">
              {showAnnual
                ? <><p className="flex items-end gap-1.5"><span className="text-4xl font-extrabold tracking-tight text-[#25275B]">{money(offer.perMonth)}</span><span className="pb-1.5 text-sm text-slate-500">/mês</span></p>
                    <p className="mt-1 text-sm text-slate-500"><span className="line-through">{money(plan.monthlyPrice!)}</span> · {money(offer.total)} cobrados uma vez por ano</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-700">Economize {money(offer.savings)} por ano</p></>
                : plan.monthlyPrice
                  ? <><p className="flex items-end gap-1.5"><span className="text-4xl font-extrabold tracking-tight text-[#25275B]">{money(plan.monthlyPrice)}</span><span className="pb-1.5 text-sm text-slate-500">/mês</span></p>
                      <p className="mt-1 text-sm text-slate-500">{offer ? `ou ${money(offer.perMonth)}/mês no plano anual` : 'Cobrança mensal no cartão'}</p></>
                  : <p className="text-2xl font-extrabold text-[#25275B]">Sob consulta</p>}
            </div>

            <div className="mt-5 rounded-2xl bg-[#F7F8FC] px-5 py-4"><p className="text-sm font-bold text-[#25275B]">{trialLabel} grátis para experimentar</p><p className="mt-0.5 text-xs text-slate-500">Sem cartão no cadastro. Você só assina se gostar.</p></div>

            <div className="mt-6 space-y-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">O que está incluído</p>{planFeatures(plan).map(feature => <div key={feature} className="flex items-start gap-3 text-sm text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" />{feature}</div>)}</div>

            <Link href={`/register?plano=${plan.code}`} className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition ${copy.featured ? 'bg-[#004751] text-white hover:bg-[#003943]' : 'border border-[#004751] text-[#004751] hover:bg-[#004751]/5'}`}>Começar teste grátis<ArrowRight size={16} /></Link>
          </div>
        </article>;
      })}
    </div>

    <div className="mx-auto mt-7 grid max-w-4xl gap-3 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"><CreditCard size={20} className="mt-0.5 shrink-0 text-[#004751]" /><p className="text-xs leading-5 text-slate-500">Depois do teste, você assina dentro do próprio TendiDesk: mensal{hasAnnual ? ' ou anual com desconto' : ''}, no cartão de crédito, com pagamento processado pela Pagar.me.</p></div>
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#004751]" /><p className="text-xs leading-5 text-slate-500">O limite de respostas da IA renova todo mês. Se ele acabar, as conversas seguem normalmente com a sua equipe. Integrações adicionais dependem de escopo e configuração.</p></div>
    </div>

    <details className="mx-auto mt-8 max-w-4xl rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer px-6 py-5 text-sm font-bold text-[#25275B]">Comparar os planos</summary><div className="overflow-x-auto px-4 pb-5"><table className="w-full min-w-[560px] border-collapse text-left text-sm">
      <thead><tr className="border-b border-slate-200"><th className="sticky left-0 bg-white px-3 py-3 text-slate-500">Recurso</th>{plans.map(plan => <th key={plan.code} className="px-3 py-3 text-[#25275B]">{plan.name}</th>)}</tr></thead>
      <tbody>
        <tr className="border-b border-slate-100"><th className="sticky left-0 bg-white px-3 py-3 font-medium text-slate-600">Preço mensal</th>{plans.map(plan => <td key={plan.code} className="px-3 py-3 font-semibold text-slate-700">{plan.monthlyPrice ? money(plan.monthlyPrice) : '—'}</td>)}</tr>
        {hasAnnual && <tr className="border-b border-slate-100"><th className="sticky left-0 bg-white px-3 py-3 font-medium text-slate-600">Plano anual</th>{plans.map((plan, i) => <td key={plan.code} className="px-3 py-3 text-slate-600">{offers[i] ? `${money(offers[i]!.total)} (${offers[i]!.percent}% off)` : '—'}</td>)}</tr>}
        {rows.map(row => <tr key={row.feature} className="border-b border-slate-100"><th className="sticky left-0 bg-white px-3 py-3 font-medium text-slate-600">{row.feature}</th>{row.values.map((value, i) => <td key={plans[i]!.code} className="px-3 py-3 text-slate-600">{value}</td>)}</tr>)}
      </tbody>
    </table></div></details>
  </>;
}
