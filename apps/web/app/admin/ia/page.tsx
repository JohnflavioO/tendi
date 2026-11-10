'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, CircleCheck, CircleX, Loader2, Save, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BusinessEditor, EMPTY_PROFILE, type BusinessData } from '@/components/ai/business-editor';
import { AI_PROVIDERS, AI_TONES, buildSystemPrompt, type AiProvider, type AiTone } from '@/lib/ai-agent';

type Org = { id: string; name: string; plan_code: string };
type AgentForm = {
  name: string;
  is_enabled: boolean;
  niche: string;
  tone: AiTone;
  system_instructions: string;
  provider: '' | AiProvider;
  model: string;
  auto_enable_new_conversations: boolean;
};
type GlobalAi = { provider: AiProvider; models: Record<AiProvider, string> };

const DEFAULT_AGENT: AgentForm = {
  name: 'Assistente',
  is_enabled: false,
  niche: '',
  tone: 'cordial',
  system_instructions: '',
  provider: '',
  model: '',
  auto_enable_new_conversations: false,
};
const DEFAULT_GLOBAL: GlobalAi = { provider: 'anthropic', models: { anthropic: 'claude-haiku-5-5', openai: '' } };

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#A7A8D0]';
const labelClass = 'block text-xs font-semibold text-slate-600';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

export default function AdminAiPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [planAi, setPlanAi] = useState<Record<string, boolean>>({});
  const [summaries, setSummaries] = useState<Record<string, { is_enabled: boolean }>>({});
  const [selectedId, setSelectedId] = useState('');
  const [global, setGlobal] = useState<GlobalAi>(DEFAULT_GLOBAL);
  const [keys, setKeys] = useState<Record<string, boolean> | null>(null);
  const [agent, setAgent] = useState<AgentForm>(DEFAULT_AGENT);
  const [agentLoading, setAgentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState<BusinessData>({ profile: EMPTY_PROFILE, knowledge: [] });

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!admin) { setLoading(false); return; }
      setAuthorized(true);

      const [orgResult, planResult, agentResult, settingResult] = await Promise.all([
        supabase.from('organizations').select('id,name,plan_code').order('name'),
        supabase.from('subscription_plans').select('code,ai_enabled'),
        supabase.from('ai_agents').select('organization_id,is_enabled'),
        supabase.from('platform_settings').select('value').eq('key', 'ai').maybeSingle(),
      ]);
      if (orgResult.error) setError(orgResult.error.message);
      if (agentResult.error) setError('Não foi possível ler os agentes. Confirme se a migração do agente de IA foi aplicada no Supabase.');
      const list = (orgResult.data ?? []) as Org[];
      setOrgs(list);
      setSelectedId(list[0]?.id ?? '');
      setPlanAi(Object.fromEntries(((planResult.data ?? []) as Array<{ code: string; ai_enabled: boolean }>).map(plan => [plan.code, plan.ai_enabled])));
      setSummaries(Object.fromEntries(((agentResult.data ?? []) as Array<{ organization_id: string; is_enabled: boolean }>).map(row => [row.organization_id, { is_enabled: row.is_enabled }])));
      const value = settingResult.data?.value;
      if (value && typeof value === 'object') {
        setGlobal({
          provider: value.provider === 'openai' ? 'openai' : 'anthropic',
          models: { anthropic: String(value.models?.anthropic ?? DEFAULT_GLOBAL.models.anthropic), openai: String(value.models?.openai ?? '') },
        });
      }
      const status = await fetch('/api/admin/ai/status').then(response => (response.ok ? response.json() : null)).catch(() => null);
      setKeys(status?.keys ?? null);
      setLoading(false);
    }
    void load().catch(err => { setError(err instanceof Error ? err.message : 'Falha ao carregar.'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setAgentLoading(true);
    setNotice('');
    (async () => {
      const supabase = createClient() as any;
      const { data, error: queryError } = await supabase.from('ai_agents').select('*').eq('organization_id', selectedId).maybeSingle();
      if (!active) return;
      if (queryError) setError('Não foi possível ler o agente desta empresa. Confirme se a migração do agente de IA foi aplicada no Supabase.');
      setAgent(data ? {
        name: data.name ?? DEFAULT_AGENT.name,
        is_enabled: Boolean(data.is_enabled),
        niche: data.niche ?? '',
        tone: (AI_TONES.some(tone => tone.value === data.tone) ? data.tone : 'cordial') as AiTone,
        system_instructions: data.system_instructions ?? '',
        provider: data.provider === 'anthropic' || data.provider === 'openai' ? data.provider : '',
        model: data.model ?? '',
        auto_enable_new_conversations: Boolean(data.auto_enable_new_conversations),
      } : DEFAULT_AGENT);
      setAgentLoading(false);
    })();
    return () => { active = false; };
  }, [selectedId]);

  const handleBusinessChange = useCallback((data: BusinessData) => setBusiness(data), []);
  const org = orgs.find(item => item.id === selectedId) ?? null;
  const setField = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => setAgent(current => ({ ...current, [key]: value }));

  const effectiveProvider: AiProvider = agent.provider || global.provider;
  const effectiveModel = agent.model.trim() || global.models[effectiveProvider];
  const providerReady = keys ? Boolean(keys[effectiveProvider]) : null;

  const promptPreview = useMemo(() => {
    if (!org) return '';
    return buildSystemPrompt({
      agentName: agent.name,
      companyName: org.name,
      niche: agent.niche,
      tone: agent.tone,
      instructions: agent.system_instructions,
      profile: business.profile,
      knowledge: business.knowledge,
      hours: business.profile.business_hours,
      timezone: business.profile.timezone,
    });
  }, [org, agent, business]);

  async function saveGlobal() {
    setSaving(true); setError(''); setNotice('');
    const supabase = createClient() as any;
    const { error: saveError } = await supabase.from('platform_settings').upsert({
      key: 'ai',
      value: { provider: global.provider, models: { anthropic: global.models.anthropic.trim(), openai: global.models.openai.trim() } },
      description: 'Provedor e modelo padrão dos agentes de IA. As chaves de API ficam em variáveis de ambiente do servidor.',
    }, { onConflict: 'key' });
    setSaving(false);
    if (saveError) setError(saveError.message); else setNotice('Configuração global salva.');
  }

  async function saveAgent() {
    if (!org) return;
    const name = agent.name.trim();
    if (!name || name.length > 60) { setError('O nome do agente precisa ter de 1 a 60 caracteres.'); return; }
    setSaving(true); setError(''); setNotice('');
    const supabase = createClient() as any;
    const { error: saveError } = await supabase.from('ai_agents').upsert({
      organization_id: org.id,
      name,
      is_enabled: agent.is_enabled,
      niche: agent.niche.trim(),
      tone: agent.tone,
      system_instructions: agent.system_instructions.trim(),
      provider: agent.provider || null,
      model: agent.model.trim() || null,
      auto_enable_new_conversations: agent.auto_enable_new_conversations,
    }, { onConflict: 'organization_id' });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setSummaries(current => ({ ...current, [org.id]: { is_enabled: agent.is_enabled } }));
    setNotice(`Agente de ${org.name} salvo.`);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28} /></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F6F7FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32} /><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Esta área é exclusiva do Super Admin da plataforma.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const planIncludesAi = org ? planAi[org.plan_code] !== false : true;

  return <main className="min-h-screen bg-[#F6F7FB] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3"><img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain" /><div className="border-l border-slate-200 pl-3"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#CB0A9F]">Super Admin</p><h1 className="text-sm font-bold text-[#25275B]">Agentes de IA</h1></div></div>
      <a href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#004751]"><ArrowLeft size={16} /> Voltar ao painel</a>
    </div></header>

    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#FCEAF7] p-3 text-[#CB0A9F]"><Sparkles size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Provedor de IA (padrão da plataforma)</h2><p className="text-xs text-slate-400">Cada empresa pode usar outro provedor ou modelo no próprio agente. As chaves de API ficam só nas variáveis de ambiente do servidor (Vercel).</p></div></div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className={labelClass}>Provedor padrão<select value={global.provider} onChange={e => setGlobal(current => ({ ...current, provider: e.target.value as AiProvider }))} className={inputClass}>{AI_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
          <label className={labelClass}>Modelo padrão do Claude<input value={global.models.anthropic} onChange={e => setGlobal(current => ({ ...current, models: { ...current.models, anthropic: e.target.value } }))} className={inputClass} placeholder="claude-haiku-5-5" /></label>
          <label className={labelClass}>Modelo padrão da OpenAI<input value={global.models.openai} onChange={e => setGlobal(current => ({ ...current, models: { ...current.models, openai: e.target.value } }))} className={inputClass} placeholder="Informe o nome do modelo" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {AI_PROVIDERS.map(provider => <span key={provider.value} className={keys?.[provider.value] ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700' : 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500'}>{keys?.[provider.value] ? <CircleCheck size={13} /> : <CircleX size={13} />}{provider.label}: {keys === null ? 'não foi possível verificar' : keys[provider.value] ? `chave ${provider.envKey} configurada` : `falta ${provider.envKey} na Vercel`}</span>)}
        </div>
        <button type="button" onClick={() => void saveGlobal()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar configuração global</button>
      </section>

      <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:self-start">
          <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Empresas</p>
          {orgs.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Nenhuma empresa cadastrada.</p>}
          <ul className="space-y-1">{orgs.map(item => <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} className={item.id === selectedId ? 'flex w-full items-center justify-between gap-2 rounded-xl bg-[#F0F0FA] px-3 py-2.5 text-left text-sm font-semibold text-[#2F316B]' : 'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50'}><span className="truncate">{item.name}</span><span className={summaries[item.id]?.is_enabled ? 'shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700' : 'shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500'}>{summaries[item.id]?.is_enabled ? 'IA ligada' : summaries[item.id] ? 'IA desligada' : 'Sem agente'}</span></button></li>)}</ul>
        </aside>

        {org && <div className="space-y-5">
          {!planIncludesAi && <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />O plano atual desta empresa ({org.plan_code}) não inclui inteligência artificial. Libere o recurso em Planos antes de ligar o agente.</p>}

          <section className={cardClass}>
            <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Bot size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Agente de {org.name}</h2><p className="text-xs text-slate-400">Treinamento do agente para o nicho da empresa. Só o Super Admin edita esta seção.</p></div></div>
            {agentLoading ? <div className="grid h-32 place-items-center"><Loader2 className="animate-spin text-[#2F316B]" /></div> : <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass}>Nome do agente (aparece na conversa)<input maxLength={60} value={agent.name} onChange={e => setField('name', e.target.value)} className={inputClass} placeholder="Ex.: Bia" /></label>
                <label className={labelClass}>Nicho / segmento<input maxLength={200} value={agent.niche} onChange={e => setField('niche', e.target.value)} className={inputClass} placeholder="Ex.: clínica odontológica" /></label>
                <label className={labelClass}>Tom de voz<select value={agent.tone} onChange={e => setField('tone', e.target.value as AiTone)} className={inputClass}>{AI_TONES.map(tone => <option key={tone.value} value={tone.value}>{tone.label}: {tone.hint}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Provedor desta empresa<select value={agent.provider} onChange={e => setField('provider', e.target.value as '' | AiProvider)} className={inputClass}><option value="">Padrão da plataforma</option>{AI_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></label>
                  <label className={labelClass}>Modelo (opcional)<input maxLength={80} value={agent.model} onChange={e => setField('model', e.target.value)} className={inputClass} placeholder="Padrão" /></label>
                </div>
              </div>
              <label className={`${labelClass} mt-4`}>Instruções de treinamento (como o agente deve atender neste nicho)<textarea rows={8} maxLength={12000} value={agent.system_instructions} onChange={e => setField('system_instructions', e.target.value)} className={inputClass} placeholder={'Ex.: Seu objetivo é agendar avaliações. Pergunte o nome e o melhor horário. Nunca informe diagnósticos nem valores de tratamentos que não estejam na base.'} /></label>
              <p className="mt-1 text-right text-[11px] text-slate-400">{agent.system_instructions.length.toLocaleString('pt-BR')} / 12.000</p>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={agent.is_enabled} onChange={e => setField('is_enabled', e.target.checked)} />Agente liberado para esta empresa (os atendentes poderão ligar a IA nas conversas)</label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={agent.auto_enable_new_conversations} onChange={e => setField('auto_enable_new_conversations', e.target.checked)} />Ligar a IA automaticamente em conversas novas</label>
              </div>
              <p className="mt-4 rounded-xl bg-[#FAFBFD] p-3 text-xs text-slate-500">Vai usar: <b className="text-slate-700">{AI_PROVIDERS.find(provider => provider.value === effectiveProvider)?.label}</b> · modelo <b className="text-slate-700">{effectiveModel || 'não definido (informe o modelo padrão acima)'}</b>{providerReady === false && <span className="ml-1 font-semibold text-rose-600">· falta a chave de API deste provedor na Vercel</span>}</p>
              <button type="button" onClick={() => void saveAgent()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar agente</button>
            </>}
          </section>

          <BusinessEditor organizationId={org.id} onChange={handleBusinessChange} />

          <details className={cardClass}>
            <summary className="cursor-pointer text-sm font-bold text-[#2F316B]">Prévia do prompt final enviado à IA</summary>
            <p className="mt-2 text-xs text-slate-400">É exatamente o que o agente recebe: seus dados mais as regras fixas de segurança e de transferência. Salve as alterações para ver a versão atualizada.</p>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">{promptPreview}</pre>
          </details>
        </div>}
      </section>
    </div>
  </main>;
}
