'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CircleCheck, CircleX, Copy, CreditCard, Loader2, Receipt, ShieldCheck, Webhook } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import { annualDiscountPercent } from '@/lib/billing-format';

type Status = {
  secretKey: { configured: boolean; environment?: string; hint?: string };
  webhookUrl: string | null;
  events: string[];
};
type Plan = { code: string; name: string; monthly_price: number | null; pagarme_plan_id: string | null; annual_price: number | null; pagarme_annual_plan_id: string | null; is_active: boolean };
type Sub = { organization_id: string; plan_code: string | null; status: string; next_billing_at: string | null; card_last_digits: string | null; organizations: { name: string } | null };

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#A7A8D0]';
const STATUS_LABEL: Record<string, string> = { active: 'Ativa', past_due: 'Pagamento pendente', canceled: 'Cancelada' };

export default function BillingAdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [planIds, setPlanIds] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Sub[]>([]);
  const [keyValue, setKeyValue] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient() as any;
    const [{ data: planRows }, { data: subRows }] = await Promise.all([
      supabase.from('subscription_plans').select('code,name,monthly_price,pagarme_plan_id,annual_price,pagarme_annual_plan_id,is_active').order('display_order'),
      supabase.from('billing_subscriptions').select('organization_id,plan_code,status,next_billing_at,card_last_digits,organizations(name)').order('updated_at', { ascending: false }),
    ]);
    const list = (planRows ?? []) as Plan[];
    setPlans(list);
    setPrices(Object.fromEntries(list.map(plan => [plan.code, plan.monthly_price ? String(plan.monthly_price).replace('.', ',') : ''])));
    setSubs((subRows ?? []) as Sub[]);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!admin) { setLoading(false); return; }
      setAuthorized(true);
      const response = await fetch('/api/admin/billing').catch(() => null);
      if (response?.ok) setStatus(await response.json());
      await loadData();
      setLoading(false);
    }
    void load();
  }, [loadData]);

  async function call(label: string, url: string, init?: RequestInit) {
    setBusy(label); setMessage(null);
    const response = await fetch(url, init).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy('');
    return { ok: Boolean(response?.ok), data };
  }

  async function saveKey() {
    const { ok, data } = await call('key', '/api/admin/billing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secretKey: keyValue }) });
    if (!ok) { setMessage({ ok: false, text: data?.error ?? 'Não foi possível salvar a chave.' }); return; }
    setStatus(data); setKeyValue(''); setMessage({ ok: true, text: 'Chave salva. Clique em "Testar conexão".' });
  }

  async function removeKey() {
    if (!window.confirm('Remover a chave da Pagar.me? Novas assinaturas e a atualização das existentes param até uma nova chave ser cadastrada.')) return;
    const { ok, data } = await call('remove', '/api/admin/billing', { method: 'DELETE' });
    if (ok) { setStatus(data); setMessage({ ok: true, text: 'Chave removida.' }); } else setMessage({ ok: false, text: data?.error ?? 'Falha ao remover.' });
  }

  async function test() {
    const { data } = await call('test', '/api/admin/billing/test', { method: 'POST' });
    setMessage(data?.ok ? { ok: true, text: 'Conectado à Pagar.me.' } : { ok: false, text: data?.error ?? 'Falha ao testar.' });
  }

  async function publish(plan: Plan) {
    const monthlyPrice = Number((prices[plan.code] ?? '').replace(/\./g, '').replace(',', '.'));
    const { ok, data } = await call(`plan-${plan.code}`, '/api/admin/billing/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: plan.code, monthlyPrice }) });
    if (!ok) { setMessage({ ok: false, text: data?.error ?? 'Falha ao publicar o plano.' }); return; }
    setMessage({ ok: true, text: `${plan.name} publicado na Pagar.me por ${monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês.` });
    await loadData();
  }

  async function link(plan: Plan, period: 'monthly' | 'annual') {
    const field = period === 'annual' ? `${plan.code}:annual` : plan.code;
    const pagarmePlanId = (planIds[field] ?? '').trim();
    const { ok, data } = await call(`link-${field}`, '/api/admin/billing/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: plan.code, pagarmePlanId, period }) });
    if (!ok) { setMessage({ ok: false, text: data?.error ?? 'Falha ao vincular o plano.' }); return; }
    const price = Number(data.price ?? data.monthlyPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    setMessage({ ok: true, text: `${plan.name} ${period === 'annual' ? 'anual' : 'mensal'} vinculado a ${pagarmePlanId} (${price}/${period === 'annual' ? 'ano' : 'mês'}).` });
    setPlanIds(current => ({ ...current, [field]: '' }));
    await loadData();
  }

  function linkField(plan: Plan, period: 'monthly' | 'annual') {
    const field = period === 'annual' ? `${plan.code}:annual` : plan.code;
    return <div key={field} className="flex w-full flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
      <span className="w-40 text-xs text-slate-500">{period === 'annual' ? 'Plano anual (desconto):' : 'Vincular plano mensal:'}</span>
      <input value={planIds[field] ?? ''} onChange={e => setPlanIds(current => ({ ...current, [field]: e.target.value }))} placeholder="plan_..." spellCheck={false} className={`${input} max-w-[260px] font-mono text-xs`} />
      <button type="button" onClick={() => void link(plan, period)} disabled={!connected || !(planIds[field] ?? '').trim() || busy !== ''} className="inline-flex items-center gap-1.5 rounded-xl border border-[#004751] px-3 py-2 text-[11px] font-semibold text-[#004751] disabled:opacity-50">{busy === `link-${field}` && <Loader2 size={12} className="animate-spin" />}Vincular</button>
    </div>;
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28} /></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const connected = Boolean(status?.secretKey.configured);

  return <AdminShell title="Pagamentos e assinaturas">

    <div className="space-y-6">
      {message && <p role="status" className={message.ok ? 'rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700' : 'rounded-xl bg-rose-50 p-3 text-xs text-rose-700'}>{message.text}</p>}

      <section className={card}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><CreditCard size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">1. Conectar a Pagar.me</h2><p className="text-xs text-slate-400">Na Dashboard da Pagar.me, abra Configurações › Chaves e copie a chave secreta (sk_...). Use a de teste (sk_test_) para validar antes de ir para produção.</p></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={connected ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700' : 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500'}>{connected ? <CircleCheck size={13} /> : <CircleX size={13} />}{connected ? `Conectado · ambiente de ${status?.secretKey.environment} · chave …${status?.secretKey.hint}` : 'Não conectado'}</span>
          {connected && <><button type="button" onClick={() => void test()} disabled={busy !== ''} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2F316B] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy === 'test' && <Loader2 size={12} className="animate-spin" />}Testar conexão</button><button type="button" onClick={() => void removeKey()} disabled={busy !== ''} className="rounded-xl px-3 py-2 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">Remover</button></>}
        </div>
        <div className="mt-4 flex gap-2"><input type="password" autoComplete="off" spellCheck={false} value={keyValue} onChange={e => setKeyValue(e.target.value)} placeholder={connected ? 'Colar nova chave para trocar' : 'sk_...'} className={input} /><button type="button" onClick={() => void saveKey()} disabled={!keyValue.trim() || busy !== ''} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#004751] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === 'key' && <Loader2 size={12} className="animate-spin" />}Salvar chave</button></div>
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#E8F4F2] p-3 text-[#004751]"><Webhook size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">2. Cadastrar o webhook na Pagar.me</h2><p className="text-xs text-slate-400">Na Dashboard da Pagar.me, abra Configurações › Webhooks, crie um webhook com esta URL e marque os eventos abaixo. É assim que o Tendi libera ou pausa cada empresa automaticamente.</p></div></div>
        {status?.webhookUrl ? <div className="flex gap-2"><input readOnly value={status.webhookUrl} className={`${input} font-mono text-xs`} onFocus={e => e.target.select()} /><button type="button" onClick={() => { void navigator.clipboard.writeText(status.webhookUrl ?? ''); setMessage({ ok: true, text: 'URL do webhook copiada.' }); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Copy size={13} />Copiar</button></div> : <p className="text-xs text-rose-600">Não foi possível gerar a URL do webhook. Confirme se a migração de cobrança foi aplicada no Supabase.</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">{(status?.events ?? []).map(event => <code key={event} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{event}</code>)}</div>
        <p className="mt-3 text-[11px] text-slate-400">A URL contém um código secreto: não compartilhe. Ela usa o endereço deste ambiente; em produção, abra esta página no domínio oficial do Tendi.</p>
      </section>

      <section className={card}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#FCEAF7] p-3 text-[#CB0A9F]"><Receipt size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">3. Preço dos planos</h2><p className="text-xs text-slate-400">Já criou o plano na Stone/Pagar.me (Venda por assinatura)? Cole o ID dele (plan_...) e clique em Vincular: o Tendi confere o plano e usa o valor cadastrado lá. Ou digite o valor e clique em Publicar para o Tendi criar o plano. Mudar o preço cria um plano novo: quem já assina continua no valor antigo.</p></div></div>
        <div className="space-y-3">{plans.map(plan => <div key={plan.code} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#FAFBFD] p-3">
          <div className="min-w-[140px] flex-1"><p className="text-sm font-semibold text-slate-700">{plan.name}</p><p className="text-[11px] text-slate-400">{plan.pagarme_plan_id ? `Mensal · ${plan.pagarme_plan_id}` : 'Mensal não vinculado'}{plan.pagarme_annual_plan_id ? ` · Anual · ${plan.pagarme_annual_plan_id} · ${Number(plan.annual_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/ano${annualDiscountPercent(plan.monthly_price, plan.annual_price) ? ` (${annualDiscountPercent(plan.monthly_price, plan.annual_price)}% off)` : ''}` : ' · Anual não vinculado'}{!plan.is_active ? ' · plano inativo' : ''}</p></div>
          <label className="flex items-center gap-2 text-xs text-slate-500">R$<input inputMode="decimal" value={prices[plan.code] ?? ''} onChange={e => setPrices(current => ({ ...current, [plan.code]: e.target.value }))} placeholder="197,00" className={`${input} w-28`} />/mês</label>
          <button type="button" onClick={() => void publish(plan)} disabled={!connected || !(prices[plan.code] ?? '').trim() || busy !== ''} className="inline-flex items-center gap-1.5 rounded-xl bg-[#004751] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy === `plan-${plan.code}` && <Loader2 size={12} className="animate-spin" />}Publicar na Pagar.me</button>
          {linkField(plan, 'monthly')}
          {linkField(plan, 'annual')}
        </div>)}</div>
      </section>

      <section className={card}>
        <h2 className="mb-4 text-sm font-bold text-[#2F316B]">Assinaturas</h2>
        {subs.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="py-2">Empresa</th><th>Plano</th><th>Situação</th><th>Próxima cobrança</th><th>Cartão</th></tr></thead><tbody>{subs.map(sub => <tr key={sub.organization_id} className="border-t border-slate-100"><td className="py-2.5 font-semibold text-slate-700">{sub.organizations?.name ?? sub.organization_id}</td><td>{plans.find(plan => plan.code === sub.plan_code)?.name ?? sub.plan_code ?? '—'}</td><td><span className={sub.status === 'active' ? 'text-emerald-700' : sub.status === 'past_due' ? 'text-amber-700' : 'text-slate-500'}>{STATUS_LABEL[sub.status] ?? sub.status}</span></td><td>{sub.next_billing_at ? new Date(sub.next_billing_at).toLocaleDateString('pt-BR') : '—'}</td><td>{sub.card_last_digits ? `•••• ${sub.card_last_digits}` : '—'}</td></tr>)}</tbody></table></div> : <p className="text-xs text-slate-400">Nenhuma assinatura ainda.</p>}
      </section>
    </div>
  </AdminShell>;
}
