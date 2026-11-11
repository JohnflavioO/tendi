'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Gauge, Loader2, Save, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import {
  monthStartIso, normalizeLimits, normalizePricing, resolveMonthlyLimit, typicalReplyCostBrl, usageLevel,
  type AiLimitSettings, type AiPricing,
} from '@/lib/ai-limits';

type Plan = { code: string; name: string; monthly_price: number | null; ai_monthly_replies: number | null };
type Org = { id: string; name: string; status: string; plan_code: string | null };
type Agent = { organization_id: string; is_enabled: boolean; model: string | null; monthly_reply_limit: number | null };
type Usage = { organization_id: string; replies: number; limit_hits: number; errors: number; input_tokens: number; output_tokens: number; cost_usd: number };

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#A7A8D0]';
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 4 : 2 });
const num = (value: number) => value.toLocaleString('pt-BR');
const parse = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));

/** Margem acima de 30% da mensalidade gasta com IA merece atenção. */
const COST_ALERT = 0.3;

export default function AiUsagePage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [limits, setLimits] = useState<AiLimitSettings>(normalizeLimits(null));
  const [pricing, setPricing] = useState<AiPricing>(normalizePricing(null));
  const [globalModel, setGlobalModel] = useState('claude-haiku-5-5');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient() as any;
    const [planRes, orgRes, agentRes, settingRes, usageRes] = await Promise.all([
      supabase.from('subscription_plans').select('code,name,monthly_price,ai_monthly_replies').order('display_order'),
      supabase.from('organizations').select('id,name,status,plan_code,slug').order('name'),
      supabase.from('ai_agents').select('organization_id,is_enabled,model,monthly_reply_limit'),
      supabase.from('platform_settings').select('key,value').in('key', ['ai', 'ai_limits', 'ai_pricing']),
      supabase.rpc('ai_usage_by_organization', { p_since: monthStartIso() }),
    ]);
    const settingOf = (key: string) => ((settingRes.data ?? []) as Array<{ key: string; value: any }>).find(row => row.key === key)?.value;
    const nextLimits = normalizeLimits(settingOf('ai_limits'));
    const nextPricing = normalizePricing(settingOf('ai_pricing'));
    const ai = settingOf('ai');
    const planList = (planRes.data ?? []) as Plan[];
    setPlans(planList);
    setOrgs(((orgRes.data ?? []) as Array<Org & { slug: string }>).filter(org => org.slug !== 'tendi'));
    setAgents((agentRes.data ?? []) as Agent[]);
    setUsage(((usageRes.data ?? []) as any[]).map(row => ({ ...row, replies: Number(row.replies), limit_hits: Number(row.limit_hits), errors: Number(row.errors), input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens), cost_usd: Number(row.cost_usd) })));
    setLimits(nextLimits);
    setPricing(nextPricing);
    if (typeof ai?.models?.anthropic === 'string' && ai.models.anthropic) setGlobalModel(ai.models.anthropic);
    setForm({
      ...Object.fromEntries(planList.map(plan => [`plan:${plan.code}`, plan.ai_monthly_replies ? String(plan.ai_monthly_replies) : ''])),
      default: String(nextLimits.defaultMonthlyReplies),
      trial: String(nextLimits.trialMonthlyReplies),
      usd: String(nextPricing.usdBrl).replace('.', ','),
      ...Object.fromEntries(Object.entries(nextPricing.models).flatMap(([model, price]) => [[`in:${model}`, String(price.input).replace('.', ',')], [`out:${model}`, String(price.output).replace('.', ',')]])),
    });
    if (usageRes.error) setMessage({ ok: false, text: 'Não foi possível ler o consumo. Confirme se a migração de limites da IA foi aplicada no Supabase.' });
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!admin) { setLoading(false); return; }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const rows = useMemo(() => orgs.map(org => {
    const agent = agents.find(item => item.organization_id === org.id);
    const plan = plans.find(item => item.code === org.plan_code);
    const used = usage.find(item => item.organization_id === org.id);
    const limit = resolveMonthlyLimit({ agentLimit: agent?.monthly_reply_limit, planLimit: plan?.ai_monthly_replies, isTrial: org.status === 'trial', settings: limits });
    const cost = (used?.cost_usd ?? 0) * pricing.usdBrl;
    const share = plan?.monthly_price ? cost / Number(plan.monthly_price) : null;
    return { org, agent, plan, used, limit, cost, share, model: agent?.model || globalModel };
  }), [orgs, agents, plans, usage, limits, pricing, globalModel]);

  async function save() {
    setSaving(true); setMessage(null);
    const supabase = createClient() as any;
    try {
      const defaultReplies = Math.round(parse(form.default ?? ''));
      const trialReplies = Math.round(parse(form.trial ?? ''));
      const usd = parse(form.usd ?? '');
      if (!(defaultReplies > 0) || !(trialReplies > 0)) throw new Error('Os limites padrão e de teste precisam ser maiores que zero.');
      if (!(usd > 0)) throw new Error('Informe a cotação do dólar.');
      const models = Object.fromEntries(Object.keys(pricing.models).map(model => [model, { input: parse(form[`in:${model}`] ?? ''), output: parse(form[`out:${model}`] ?? '') }]));
      if (Object.values(models).some(price => !(price.input >= 0) || !(price.output >= 0))) throw new Error('Confira os preços dos modelos.');

      for (const plan of plans) {
        const raw = (form[`plan:${plan.code}`] ?? '').trim();
        const value = raw ? Math.round(parse(raw)) : null;
        if (value !== null && !(value > 0)) throw new Error(`Limite inválido no plano ${plan.name}.`);
        const { error } = await supabase.from('subscription_plans').update({ ai_monthly_replies: value }).eq('code', plan.code);
        if (error) throw error;
      }
      const { error } = await supabase.from('platform_settings').upsert([
        { key: 'ai_limits', value: { default_monthly_replies: defaultReplies, trial_monthly_replies: trialReplies }, description: 'Limites de respostas da IA por mês: padrão (empresa sem plano reconhecido) e teto durante o teste gratuito.' },
        { key: 'ai_pricing', value: { usd_brl: usd, models }, description: 'Preço de tabela dos modelos (US$ por 1 milhão de tokens) e cotação do dólar, para estimar o custo da IA por empresa.' },
      ], { onConflict: 'key' });
      if (error) throw error;
      await load();
      setMessage({ ok: true, text: 'Limites e preços salvos.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Falha ao salvar.' });
    } finally { setSaving(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28} /></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const replyCost = typicalReplyCostBrl(pricing, globalModel);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalReplies = rows.reduce((sum, row) => sum + (row.used?.replies ?? 0), 0);
  const field = (key: string, extra = '') => <input inputMode="decimal" value={form[key] ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} className={`${input} ${extra}`} />;

  return <AdminShell title="Consumo da IA">

    <div className="space-y-6">
      {message && <p role="status" className={message.ok ? 'rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700' : 'rounded-xl bg-rose-50 p-3 text-xs text-rose-700'}>{message.text}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Respostas da IA neste mês" value={num(totalReplies)} detail="Todas as empresas clientes" />
        <Stat label="Custo estimado no mês" value={brl(totalCost)} detail={`Cotação US$ 1 = ${brl(pricing.usdBrl)}`} />
        <Stat label="Custo por resposta típica" value={replyCost !== null ? brl(replyCost) : '—'} detail={`${globalModel} · ~8 mil tokens de entrada e 600 de saída`} />
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Gauge size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Uso deste mês por empresa</h2><p className="text-xs text-slate-400">Ao atingir o limite, a IA para de responder e as conversas novas vão para “Aguardando atendente”. O mês vira no dia 1º (horário de Brasília).</p></div></div>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="py-2">Empresa</th><th>Plano</th><th>Respostas / limite</th><th>Custo IA</th><th>% da mensalidade</th><th>Modelo</th></tr></thead>
          <tbody>{rows.map(row => {
            const used = row.used?.replies ?? 0;
            const level = usageLevel(used, row.limit);
            return <tr key={row.org.id} className="border-t border-slate-100 align-middle">
              <td className="py-3 font-semibold text-slate-700">{row.org.name}{row.org.status === 'trial' && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">teste</span>}{!row.agent?.is_enabled && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">IA desligada</span>}</td>
              <td>{row.plan?.name ?? row.org.plan_code ?? '—'}</td>
              <td className="min-w-[180px]"><div className="flex items-center gap-2"><span className={level === 'reached' ? 'font-semibold text-rose-600' : level === 'warning' ? 'font-semibold text-amber-700' : 'text-slate-700'}>{num(used)} / {num(row.limit)}</span>{row.agent?.monthly_reply_limit ? <span className="text-[10px] text-slate-400">(exceção)</span> : null}</div><div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100"><div className={level === 'reached' ? 'h-full bg-rose-500' : level === 'warning' ? 'h-full bg-amber-500' : 'h-full bg-[#004751]'} style={{ width: `${Math.min(100, (used / row.limit) * 100)}%` }} /></div>{row.used?.limit_hits ? <p className="mt-1 text-[10px] text-rose-600">{row.used.limit_hits} mensagem(ns) sem resposta por limite</p> : null}</td>
              <td>{brl(row.cost)}</td>
              <td>{row.share === null ? '—' : <span className={row.share > COST_ALERT ? 'font-semibold text-rose-600' : 'text-slate-700'}>{(row.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}</td>
              <td className="font-mono text-[11px] text-slate-500">{row.model}</td>
            </tr>;
          })}</tbody></table></div> : <p className="text-xs text-slate-400">Nenhuma empresa cliente ainda.</p>}
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#FCEAF7] p-3 text-[#CB0A9F]"><Wallet size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Limites por plano</h2><p className="text-xs text-slate-400">Respostas da IA por mês. Para liberar mais para um cliente específico, use “Limite mensal desta empresa” em Agentes de IA.</p></div></div>
        <div className="space-y-3">{plans.map(plan => {
          const limit = Math.round(parse(form[`plan:${plan.code}`] ?? '')) || 0;
          const worst = replyCost !== null && limit ? limit * replyCost : null;
          const share = worst !== null && plan.monthly_price ? worst / Number(plan.monthly_price) : null;
          return <div key={plan.code} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#FAFBFD] p-3">
            <div className="min-w-[160px] flex-1"><p className="text-sm font-semibold text-slate-700">{plan.name}</p><p className="text-[11px] text-slate-400">{plan.monthly_price ? `${brl(Number(plan.monthly_price))}/mês` : 'sem preço'}</p></div>
            <label className="flex items-center gap-2 text-xs text-slate-500">{field(`plan:${plan.code}`, 'w-28')} respostas/mês</label>
            <p className={share !== null && share > COST_ALERT ? 'text-[11px] font-semibold text-rose-600' : 'text-[11px] text-slate-500'}>{worst !== null ? <>Custo máximo com {globalModel}: <b>{brl(worst)}</b>{share !== null ? ` (${(share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da mensalidade)` : ''}</> : 'Sem limite definido: usa o padrão abaixo.'}</p>
          </div>;
        })}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Padrão (empresa sem plano reconhecido){field('default', 'mt-1')}</label>
          <label className="text-xs font-semibold text-slate-600">Teto durante o teste gratuito{field('trial', 'mt-1')}</label>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-bold text-[#2F316B]">Preço dos modelos (para estimar o custo)</h2>
        <p className="mt-1 text-xs text-slate-400">US$ por 1 milhão de tokens, preço de tabela do provedor. Atualize a cotação do dólar de vez em quando. O custo real aparece na fatura do provedor.</p>
        <label className="mt-4 block max-w-xs text-xs font-semibold text-slate-600">Cotação: R$ por US$ 1{field('usd', 'mt-1')}</label>
        <div className="mt-4 space-y-2">{Object.keys(pricing.models).map(model => <div key={model} className="flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="w-44 font-mono text-[11px] text-slate-700">{model}</span><label className="flex items-center gap-2">entrada {field(`in:${model}`, 'w-24')}</label><label className="flex items-center gap-2">saída {field(`out:${model}`, 'w-24')}</label></div>)}</div>
        {!pricing.models[globalModel] && <p className="mt-3 flex items-center gap-2 text-xs text-amber-700"><TriangleAlert size={14} />O modelo padrão ({globalModel}) não tem preço cadastrado: o custo dele aparece como zero.</p>}
      </section>

      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Salvar limites e preços</button>
    </div>
  </AdminShell>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#25275B]">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></article>;
}
