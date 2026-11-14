'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KanbanSquare, Loader2, PanelRightClose, Phone, Plus, Sparkles, UserCheck, UserMinus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { addTag, tagTone } from '@/lib/inbox-utils';
import { ContactAvatar } from '@/components/inbox/contact-avatar';

export type PanelConversation = {
  id: string;
  organization_id: string;
  contact_id: string;
  assigned_to: string | null;
  team_id?: string | null;
  status: string;
  teams: { name: string } | null;
  contacts: { id: string; full_name: string; phone_e164: string | null; email: string | null; tags: string[]; opt_in: boolean } | null;
};
type Stage = { id: string; name: string; color: string; position: number; final_type: string };
type Opportunity = { id: string; stage_id: string; pipeline_id: string };

const initials = (name?: string | null) => (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
const label = 'text-[10px] font-bold uppercase tracking-[.12em] text-slate-400';
const actionButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#2F316B] transition hover:bg-slate-50 disabled:opacity-50';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberta' },
  { value: 'pending', label: 'Pendente' },
  { value: 'closed', label: 'Encerrada' },
];

/**
 * Painel de contexto da conversa: ligar, copiar número, status, responsável,
 * etiquetas do contato e posição no funil do CRM. Tudo grava direto no Supabase
 * (as regras de acesso do banco valem para o usuário logado).
 */
export function ContactPanel({ conversation, userId, onChanged, onClose }: { conversation: PanelConversation; userId: string; onChanged: () => void; onClose: () => void }) {
  const contact = conversation.contacts;
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [sectors, setSectors] = useState<Array<{ id: string; name: string; color: string }>>([]);

  // Setores da empresa: definem a tag de atendimento da conversa (ex.: Suporte, Comercial).
  useEffect(() => {
    let active = true;
    void (createClient() as any).from('teams').select('id,name,color').eq('organization_id', conversation.organization_id).eq('is_active', true).order('name')
      .then(({ data }: any) => { if (active) setSectors((data ?? []) as Array<{ id: string; name: string; color: string }>); });
    return () => { active = false; };
  }, [conversation.organization_id]);

  useEffect(() => { setTags(contact?.tags ?? []); setTagDraft(''); setNotice(''); }, [contact?.id, contact?.tags]);

  const loadCrm = useCallback(async () => {
    if (!contact) return;
    setCrmLoading(true);
    const supabase = createClient() as any;
    const { data: opp } = await supabase.from('opportunities').select('id,stage_id,pipeline_id')
      .eq('organization_id', conversation.organization_id).eq('contact_id', contact.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    let resolvedPipelineId: string | null = opp?.pipeline_id ?? null;
    if (!resolvedPipelineId) {
      const { data: pipeline } = await supabase.from('crm_pipelines').select('id')
        .eq('organization_id', conversation.organization_id)
        .order('is_default', { ascending: false }).order('created_at', { ascending: true }).limit(1).maybeSingle();
      resolvedPipelineId = pipeline?.id ?? null;
    }
    setPipelineId(resolvedPipelineId);
    if (!resolvedPipelineId) { setStages([]); setOpportunity(null); setCrmLoading(false); return; }
    const { data: stageRows } = await supabase.from('crm_stages').select('id,name,color,position,final_type').eq('pipeline_id', resolvedPipelineId).order('position', { ascending: true });
    setStages((stageRows ?? []) as Stage[]);
    setOpportunity(opp ?? null);
    setCrmLoading(false);
  }, [contact, conversation.organization_id]);

  useEffect(() => { void loadCrm(); }, [loadCrm]);

  async function run(action: () => Promise<{ error: { message: string } | null }>, success?: () => void) {
    setBusy(true); setNotice('');
    const { error } = await action();
    setBusy(false);
    if (error) { setNotice(error.message); return false; }
    success?.();
    onChanged();
    return true;
  }

  const saveTags = (next: string[]) => {
    if (!contact) return;
    const previous = tags;
    setTags(next);
    void run(async () => {
      const supabase = createClient() as any;
      return supabase.from('contacts').update({ tags: next }).eq('id', contact.id).eq('organization_id', conversation.organization_id);
    }).then(ok => { if (!ok) setTags(previous); });
  };

  function submitTag(event: React.FormEvent) {
    event.preventDefault();
    const result = addTag(tags, tagDraft);
    if (result.error) { setNotice(result.error); return; }
    if (result.tags !== tags) saveTags(result.tags);
    setTagDraft('');
  }

  const setStatus = (status: string) => void run(async () => {
    const supabase = createClient() as any;
    return supabase.from('conversations').update({ status, closed_at: status === 'closed' ? new Date().toISOString() : null }).eq('id', conversation.id).eq('organization_id', conversation.organization_id);
  });

  const setSector = (teamId: string) => void run(async () => {
    const supabase = createClient() as any;
    return supabase.from('conversations').update({ team_id: teamId || null }).eq('id', conversation.id).eq('organization_id', conversation.organization_id);
  });

  const assign = (to: string | null) => void run(async () => {
    const supabase = createClient() as any;
    return supabase.from('conversations').update({ assigned_to: to }).eq('id', conversation.id).eq('organization_id', conversation.organization_id);
  });

  const moveStage = (stageId: string) => {
    if (!opportunity) return;
    const stage = stages.find(item => item.id === stageId);
    void run(async () => {
      const supabase = createClient() as any;
      return supabase.from('opportunities').update({ stage_id: stageId, closed_at: stage && stage.final_type !== 'open' ? new Date().toISOString() : null }).eq('id', opportunity.id).eq('organization_id', conversation.organization_id);
    }, () => setOpportunity({ ...opportunity, stage_id: stageId }));
  };

  const createOpportunity = () => {
    if (!contact || !pipelineId) return;
    const first = stages.find(stage => stage.final_type === 'open');
    if (!first) { setNotice('O funil deste workspace ainda não tem uma etapa aberta.'); return; }
    void run(async () => {
      const supabase = createClient() as any;
      const { data, error } = await supabase.from('opportunities')
        .insert({ organization_id: conversation.organization_id, pipeline_id: pipelineId, stage_id: first.id, contact_id: contact.id, title: contact.full_name, created_by: userId })
        .select('id,stage_id,pipeline_id').single();
      if (!error && data) setOpportunity(data as Opportunity);
      return { error };
    });
  };

  async function copyNumber() {
    if (!contact?.phone_e164) return;
    try { await navigator.clipboard.writeText(contact.phone_e164); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setNotice('Não foi possível copiar o número.'); }
  }

  if (!contact) return null;
  const mine = conversation.assigned_to === userId;
  const assignedLabel = !conversation.assigned_to ? 'Sem responsável' : mine ? 'Você' : 'Outro atendente';

  return <>
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><b className="text-xs font-bold text-[#2F316B]">Contexto do contato</b><button type="button" onClick={onClose} aria-label="Fechar painel" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><PanelRightClose size={16} /></button></div>
    <div className="border-b border-slate-100 px-5 py-6">
      <div className="flex justify-center"><ContactAvatar contactId={contact.id} name={contact.full_name} className="size-20 rounded-full text-xl" whatsapp /></div>
      <p className="mt-3 text-center text-sm font-bold text-[#25275B]">{contact.full_name}</p>
      <p className="mt-1 text-center text-xs text-slate-400">{contact.phone_e164 ?? 'Sem telefone cadastrado'}</p>
      <div className="mt-4 flex justify-center gap-2">
        {contact.phone_e164 ? <a href={`tel:${contact.phone_e164}`} className={actionButton}><Phone size={12} />Ligar</a> : <span className={`${actionButton} cursor-not-allowed opacity-50`}><Phone size={12} />Ligar</span>}
        <button type="button" onClick={() => void copyNumber()} disabled={!contact.phone_e164} className={actionButton}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copiado' : 'Copiar número'}</button>
      </div>
    </div>

    <div className="space-y-5 p-5">
      {notice && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-[11px] text-rose-700">{notice}</p>}

      <div>
        <p className={label}>Atendimento</p>
        <select aria-label="Status da conversa" value={STATUS_OPTIONS.some(option => option.value === conversation.status) ? conversation.status : 'open'} disabled={busy} onChange={event => setStatus(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 py-2 text-xs text-slate-700">{STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-slate-600">Responsável: <b className="font-semibold">{assignedLabel}</b></p>
          {mine ? <button type="button" disabled={busy} onClick={() => assign(null)} className={actionButton}><UserMinus size={12} />Liberar</button> : <button type="button" disabled={busy} onClick={() => assign(userId)} className={actionButton}><UserCheck size={12} />Assumir</button>}</div>
        <label className="mt-3 block text-[11px] font-semibold text-slate-500">Setor do atendimento
          <select aria-label="Setor do atendimento" value={conversation.team_id ?? ''} disabled={busy} onChange={event => setSector(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 py-2 text-xs text-slate-700"><option value="">Sem setor</option>{sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
        {sectors.length <= 1 && <p className="mt-1.5 text-[10px] leading-4 text-slate-400">Crie setores como Suporte e Comercial em Configurações para separar os atendimentos.</p>}
      </div>

      <div>
        <p className={label}>Etiquetas</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{tags.length ? tags.map(tag => <span key={tag} className={`inline-flex items-center gap-1 rounded-md py-1 pl-2 pr-1 text-[10px] font-bold uppercase tracking-wide ${tagTone(tag)}`}>{tag}<button type="button" aria-label={`Remover etiqueta ${tag}`} disabled={busy} onClick={() => saveTags(tags.filter(item => item !== tag))} className="rounded p-0.5 hover:bg-white/70"><X size={11} /></button></span>) : <span className="text-xs text-slate-400">Nenhuma etiqueta</span>}</div>
        <form onSubmit={submitTag} className="mt-2 flex gap-1.5"><input aria-label="Nova etiqueta" value={tagDraft} onChange={event => setTagDraft(event.target.value)} maxLength={40} placeholder="Nova etiqueta" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 py-2 text-xs focus-visible:outline-none focus:border-[#A7A8D0]" /><button type="submit" disabled={busy || !tagDraft.trim()} className={actionButton} aria-label="Adicionar etiqueta"><Plus size={12} /></button></form>
      </div>

      <div>
        <p className={label}>Funil de vendas (CRM)</p>
        {crmLoading ? <div className="mt-2"><Loader2 size={14} className="animate-spin text-slate-400" /></div>
          : !stages.length ? <p className="mt-2 text-xs text-slate-400">O funil deste workspace ainda não foi configurado.</p>
          : opportunity ? <div className="mt-2 space-y-2"><select aria-label="Etapa do funil" value={opportunity.stage_id} disabled={busy} onChange={event => moveStage(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 py-2 text-xs text-slate-700">{stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select><a href={`/crm?organization=${encodeURIComponent(conversation.organization_id)}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#004751]"><KanbanSquare size={12} />Ver no CRM</a></div>
          : <div className="mt-2 space-y-2"><p className="text-xs text-slate-500">Este contato ainda não está no funil.</p><button type="button" disabled={busy} onClick={createOpportunity} className={actionButton}><Plus size={12} />Criar oportunidade</button></div>}
      </div>

      <div><p className={label}>E-mail</p><p className="mt-1 break-all text-xs text-slate-700">{contact.email ?? 'Não informado'}</p></div>
      <div><p className={label}>Consentimento</p><p className="mt-1 text-xs text-slate-700">{contact.opt_in ? 'Opt-in registrado' : 'Não registrado'}</p></div>
      <div className="rounded-xl bg-[#F7F8FC] p-3"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#2F316B]"><Sparkles size={14} className="text-[#CB0A9F]" /> Inteligência TendiDesk</div><p className="mt-1.5 text-[10px] leading-5 text-slate-500">Resumo da conversa, tarefas e sugestões inteligentes serão disponibilizados nesta área.</p></div>
    </div>
  </>;
}
