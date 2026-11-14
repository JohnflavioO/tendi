'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Circle, Loader2, Save, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { requestedOrganizationId, resolveCurrentOrganization } from '@/lib/current-organization';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { canAccess } from '@/lib/team';
import { WorkspaceShell } from '@/components/workspace-shell';
import { AiUsageNotice } from '@/components/ai-usage-notice';
import { BusinessEditor, EMPTY_PROFILE, type BusinessData } from '@/components/ai/business-editor';
import { AI_TONES, buildSystemPrompt, type AiTone } from '@/lib/ai-agent';

type Org = { id: string; name: string; plan_code: string };
type AgentForm = {
  name: string;
  is_enabled: boolean;
  niche: string;
  tone: AiTone;
  system_instructions: string;
  auto_enable_new_conversations: boolean;
  provider: string | null;
  model: string | null;
  monthly_reply_limit: number | null;
};
const DEFAULT_AGENT: AgentForm = {
  name: 'Assistente', is_enabled: false, niche: '', tone: 'cordial', system_instructions: '',
  auto_enable_new_conversations: false, provider: null, model: null, monthly_reply_limit: null,
};

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#A7A8D0]';
const labelClass = 'block text-xs font-semibold text-slate-600';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

/**
 * Configuração do agente de IA pelo dono/admin do workspace (área "ia", mínimo admin).
 * O Super Admin continua exclusivo para provedor, modelo e limite mensal — essas três colunas
 * aparecem aqui só como leitura (a migration 20261122090000 bloqueia a escrita delas por quem não
 * é Super Admin, então nem tentamos editá-las por aqui).
 */
export default function WorkspaceAiPage() {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Org | null>(null);
  const [planIncludesAi, setPlanIncludesAi] = useState(true);
  const [agent, setAgent] = useState<AgentForm>(DEFAULT_AGENT);
  const [agentExists, setAgentExists] = useState(false);
  const [business, setBusiness] = useState<BusinessData>({ profile: EMPTY_PROFILE, knowledge: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const { role, superAdmin } = useWorkspaceRole(org?.id);
  const allowed = role === undefined ? undefined : canAccess(role, 'ia') || superAdmin;

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      const { organization } = await resolveCurrentOrganization<Org>(supabase, auth.user.id, 'id,name,plan_code', requestedOrganizationId());
      if (!organization) { setLoading(false); return; }
      setOrg(organization);

      const [planResult, agentResult] = await Promise.all([
        supabase.from('subscription_plans').select('ai_enabled').eq('code', organization.plan_code).maybeSingle(),
        supabase.from('ai_agents').select('*').eq('organization_id', organization.id).maybeSingle(),
      ]);
      setPlanIncludesAi(planResult.data?.ai_enabled !== false);
      if (agentResult.data) {
        const data = agentResult.data as Record<string, unknown>;
        setAgentExists(true);
        setAgent({
          name: String(data.name ?? DEFAULT_AGENT.name),
          is_enabled: Boolean(data.is_enabled),
          niche: String(data.niche ?? ''),
          tone: (AI_TONES.some(tone => tone.value === data.tone) ? data.tone : 'cordial') as AiTone,
          system_instructions: String(data.system_instructions ?? ''),
          auto_enable_new_conversations: Boolean(data.auto_enable_new_conversations),
          provider: typeof data.provider === 'string' ? data.provider : null,
          model: typeof data.model === 'string' ? data.model : null,
          monthly_reply_limit: typeof data.monthly_reply_limit === 'number' ? data.monthly_reply_limit : null,
        });
      }
      setLoading(false);
    }
    void load().catch(err => { setError(err instanceof Error ? err.message : 'Falha ao carregar.'); setLoading(false); });
  }, []);

  const handleBusinessChange = useCallback((data: BusinessData) => setBusiness(data), []);
  const setField = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => setAgent(current => ({ ...current, [key]: value }));

  const promptPreview = useMemo(() => {
    if (!org) return '';
    return buildSystemPrompt({
      agentName: agent.name, companyName: org.name, niche: agent.niche, tone: agent.tone, instructions: agent.system_instructions,
      profile: business.profile, knowledge: business.knowledge, hours: business.profile.business_hours, timezone: business.profile.timezone,
    });
  }, [org, agent, business]);

  const steps = useMemo(() => ([
    { done: Boolean(business.profile.company_description.trim() || business.profile.products_services.trim()), label: 'Conte sobre o negócio', hint: 'Preencha a descrição ou os produtos/serviços abaixo.' },
    { done: business.knowledge.length > 0, label: 'Adicione a base de conhecimento', hint: 'Cadastre ao menos um item (preços, políticas, dúvidas frequentes...).' },
    { done: agent.is_enabled, label: 'Ative o agente', hint: 'Marque "Agente ativo" e salve.' },
    { done: agent.is_enabled && agent.auto_enable_new_conversations, label: 'Teste uma conversa', hint: 'Ligue a IA em uma conversa no Inbox (ou marque para ligar automático) e envie uma mensagem de teste.' },
  ]), [business, agent]);
  const stepsDone = steps.filter(step => step.done).length;

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
      auto_enable_new_conversations: agent.auto_enable_new_conversations,
    }, { onConflict: 'organization_id' });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setAgentExists(true);
    setNotice('Agente salvo.');
  }

  if (loading || allowed === undefined) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] text-[#2F316B]"><Loader2 className="animate-spin" size={28} /></main>;
  if (!org) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><p className="text-sm text-slate-500">Nenhum workspace encontrado para sua conta.</p></div></main>;
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldAlert className="mx-auto text-[#CB0A9F]" size={30} /><h1 className="mt-3 font-bold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Só o dono ou um administrador do workspace configura o agente de IA.</p></div></main>;

  return <WorkspaceShell title="Agente de IA" description="Configure como a IA atende pelo WhatsApp e Webchat deste workspace">
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
      {!planIncludesAi && <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" />O plano atual não inclui inteligência artificial. <a href={`/assinatura?organization=${org.id}`} className="ml-1 font-semibold underline">Veja os planos</a>.</p>}

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-[#FCEAF7] p-3 text-[#CB0A9F]"><Sparkles size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Primeiros passos</h2><p className="text-xs text-slate-400">{stepsDone} de {steps.length} concluídos</p></div></div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#004751] transition-all" style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>
        <ul className="space-y-2">{steps.map(step => (
          <li key={step.label} className="flex items-start gap-2 text-xs">
            {step.done ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
            <span><span className={step.done ? 'font-semibold text-slate-500 line-through' : 'font-semibold text-slate-700'}>{step.label}</span><span className="ml-1.5 text-slate-400">{step.hint}</span></span>
          </li>
        ))}</ul>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Bot size={20} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Agente de {org.name}</h2><p className="text-xs text-slate-400">Como ele se apresenta e se comporta nas conversas.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Nome do agente (aparece na conversa)<input maxLength={60} value={agent.name} onChange={e => setField('name', e.target.value)} className={inputClass} placeholder="Ex.: Bia" /></label>
          <label className={labelClass}>Nicho / segmento<input maxLength={200} value={agent.niche} onChange={e => setField('niche', e.target.value)} className={inputClass} placeholder="Ex.: clínica odontológica" /></label>
        </div>
        <label className={`${labelClass} mt-4`}>Tom de voz<select value={agent.tone} onChange={e => setField('tone', e.target.value as AiTone)} className={inputClass}>{AI_TONES.map(tone => <option key={tone.value} value={tone.value}>{tone.label}: {tone.hint}</option>)}</select></label>
        <label className={`${labelClass} mt-4`}>Instruções de treinamento (como o agente deve atender)<textarea rows={8} maxLength={12000} value={agent.system_instructions} onChange={e => setField('system_instructions', e.target.value)} className={inputClass} placeholder={'Ex.: Seu objetivo é agendar avaliações. Pergunte o nome e o melhor horário. Nunca informe diagnósticos nem valores de tratamentos que não estejam na base.'} /></label>
        <p className="mt-1 text-right text-[11px] text-slate-400">{agent.system_instructions.length.toLocaleString('pt-BR')} / 12.000</p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={agent.is_enabled} onChange={e => setField('is_enabled', e.target.checked)} />Agente ativo (os atendentes poderão ligar a IA nas conversas)</label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={agent.auto_enable_new_conversations} onChange={e => setField('auto_enable_new_conversations', e.target.checked)} />Ligar a IA automaticamente em conversas novas</label>
        </div>
        <p className="mt-4 rounded-xl bg-[#FAFBFD] p-3 text-xs text-slate-500">
          Provedor e modelo: <b className="text-slate-700">{agent.provider ?? 'padrão da plataforma'}{agent.model ? ` · ${agent.model}` : ''}</b> · Limite mensal: <b className="text-slate-700">{agent.monthly_reply_limit ? `${agent.monthly_reply_limit.toLocaleString('pt-BR')} respostas` : 'do plano atual'}</b>
          <span className="mt-1 block text-slate-400">Definidos pelo Super Admin da plataforma.</span>
        </p>
        <div className="mt-3"><AiUsageNotice organizationId={org.id} /></div>
        <button type="button" onClick={() => void saveAgent()} disabled={saving || !planIncludesAi} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{agentExists ? 'Salvar agente' : 'Ativar e salvar agente'}</button>
      </section>

      <BusinessEditor organizationId={org.id} onChange={handleBusinessChange} />

      <details className={cardClass}>
        <summary className="cursor-pointer text-sm font-bold text-[#2F316B]">Prévia do que a IA recebe</summary>
        <p className="mt-2 text-xs text-slate-400">É o resumo que o agente usa para responder. Salve as alterações para ver a versão atualizada.</p>
        <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">{promptPreview}</pre>
      </details>
    </div>
  </WorkspaceShell>;
}
