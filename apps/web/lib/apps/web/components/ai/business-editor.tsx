'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Building2, Clock3, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  BRAZIL_TIMEZONES,
  DEFAULT_BUSINESS_HOURS,
  MAX_KNOWLEDGE_CHARS,
  WEEK_DAYS,
  countKnowledgeChars,
  isValidTimezone,
  normalizeBusinessHours,
  validateBusinessHours,
  type BusinessHours,
} from '@/lib/ai-agent';

export type BusinessProfile = {
  company_description: string;
  products_services: string;
  policies: string;
  greeting_message: string;
  handoff_message: string;
  outside_hours_message: string;
  timezone: string;
  business_hours: BusinessHours;
};
export type KnowledgeRow = { id: string; title: string; content: string; is_active: boolean };
export type BusinessData = { profile: BusinessProfile; knowledge: KnowledgeRow[] };

export const EMPTY_PROFILE: BusinessProfile = {
  company_description: '',
  products_services: '',
  policies: '',
  greeting_message: '',
  handoff_message: 'Vou chamar um atendente da nossa equipe para continuar com você. Só um instante!',
  outside_hours_message: 'Nossa equipe atende em horário comercial. Deixe sua mensagem que retornaremos assim que possível.',
  timezone: 'America/Fortaleza',
  business_hours: DEFAULT_BUSINESS_HOURS,
};

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#A7A8D0]';
const labelClass = 'block text-xs font-semibold text-slate-600';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Informações do negócio que alimentam o agente de IA: descrição, produtos, políticas,
 * horário de atendimento humano, mensagens de transferência e base de conhecimento.
 * O acesso é controlado pelo banco (RLS): owner/admin/manager da empresa e super admin editam.
 */
export function BusinessEditor({ organizationId, onChange }: { organizationId: string; onChange?: (data: BusinessData) => void }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [items, setItems] = useState<KnowledgeRow[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', content: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const supabase = createClient() as any;
    const [profileResult, itemsResult] = await Promise.all([
      supabase.from('ai_business_profiles').select('*').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('ai_knowledge_items').select('id,title,content,is_active').eq('organization_id', organizationId).order('created_at', { ascending: true }),
    ]);
    if (profileResult.error || itemsResult.error) {
      setNotice({ kind: 'error', text: 'Não foi possível carregar as informações do negócio. Confirme se a migração do agente de IA foi aplicada.' });
      setLoading(false);
      return;
    }
    const row = profileResult.data;
    const nextProfile: BusinessProfile = row
      ? {
          company_description: row.company_description ?? '',
          products_services: row.products_services ?? '',
          policies: row.policies ?? '',
          greeting_message: row.greeting_message ?? '',
          handoff_message: row.handoff_message ?? EMPTY_PROFILE.handoff_message,
          outside_hours_message: row.outside_hours_message ?? EMPTY_PROFILE.outside_hours_message,
          timezone: row.timezone ?? EMPTY_PROFILE.timezone,
          business_hours: normalizeBusinessHours(row.business_hours),
        }
      : EMPTY_PROFILE;
    const nextItems = (itemsResult.data ?? []) as KnowledgeRow[];
    setProfile(nextProfile);
    setItems(nextItems);
    onChange?.({ profile: nextProfile, knowledge: nextItems });
    setLoading(false);
  }, [organizationId, onChange]);

  useEffect(() => { void load(); }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => setProfile(current => ({ ...current, [key]: value }));
  const setDay = (key: keyof BusinessHours, patch: Partial<BusinessHours[keyof BusinessHours]>) =>
    setProfile(current => ({ ...current, business_hours: { ...current.business_hours, [key]: { ...current.business_hours[key], ...patch } } }));

  async function saveProfile() {
    const hoursError = validateBusinessHours(profile.business_hours);
    if (hoursError) { setNotice({ kind: 'error', text: hoursError }); return; }
    if (!isValidTimezone(profile.timezone)) { setNotice({ kind: 'error', text: 'Fuso horário inválido.' }); return; }
    setSaving(true);
    setNotice(null);
    const supabase = createClient() as any;
    const { error } = await supabase.from('ai_business_profiles').upsert({ organization_id: organizationId, ...profile }, { onConflict: 'organization_id' });
    setSaving(false);
    if (error) { setNotice({ kind: 'error', text: error.message }); return; }
    setNotice({ kind: 'ok', text: 'Informações do negócio salvas.' });
    onChange?.({ profile, knowledge: items });
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content) { setNotice({ kind: 'error', text: 'Preencha o título e o conteúdo.' }); return; }
    setSaving(true);
    setNotice(null);
    const supabase = createClient() as any;
    const { data, error } = await supabase.from('ai_knowledge_items').insert({ organization_id: organizationId, title, content }).select('id,title,content,is_active').single();
    setSaving(false);
    if (error || !data) { setNotice({ kind: 'error', text: error?.message ?? 'Não foi possível adicionar.' }); return; }
    const next = [...items, data as KnowledgeRow];
    setItems(next);
    setDraft({ title: '', content: '' });
    onChange?.({ profile, knowledge: next });
  }

  async function saveItem(id: string, patch: Partial<Pick<KnowledgeRow, 'title' | 'content' | 'is_active'>>) {
    setSaving(true);
    setNotice(null);
    const supabase = createClient() as any;
    const { error } = await supabase.from('ai_knowledge_items').update(patch).eq('id', id).eq('organization_id', organizationId);
    setSaving(false);
    if (error) { setNotice({ kind: 'error', text: error.message }); return; }
    const next = items.map(item => (item.id === id ? { ...item, ...patch } : item));
    setItems(next);
    setEditingId(null);
    onChange?.({ profile, knowledge: next });
  }

  async function removeItem(id: string) {
    if (!window.confirm('Remover este item da base de conhecimento?')) return;
    setSaving(true);
    setNotice(null);
    const supabase = createClient() as any;
    const { error } = await supabase.from('ai_knowledge_items').delete().eq('id', id).eq('organization_id', organizationId);
    setSaving(false);
    if (error) { setNotice({ kind: 'error', text: error.message }); return; }
    const next = items.filter(item => item.id !== id);
    setItems(next);
    onChange?.({ profile, knowledge: next });
  }

  if (loading) return <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-[#2F316B]" /></div>;

  const used = countKnowledgeChars(items);
  const overBudget = used > MAX_KNOWLEDGE_CHARS;

  return <div className="space-y-5">
    {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'rounded-xl bg-rose-50 p-3 text-xs text-rose-700' : 'rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700'}>{notice.text}</p>}

    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-3 text-[#2F316B]"><Building2 size={20} /></span><div><h3 className="text-sm font-bold text-[#2F316B]">Sobre o negócio</h3><p className="text-xs text-slate-400">O agente usa estas informações para responder. Quanto mais claro, melhor.</p></div></div>
      <div className="grid gap-4">
        <label className={labelClass}>Descrição da empresa<textarea rows={3} maxLength={4000} value={profile.company_description} onChange={e => setField('company_description', e.target.value)} className={inputClass} placeholder="Quem somos, onde atuamos, diferenciais..." /></label>
        <label className={labelClass}>Produtos e serviços (com preços, se puder informar)<textarea rows={5} maxLength={8000} value={profile.products_services} onChange={e => setField('products_services', e.target.value)} className={inputClass} placeholder="Limpeza dental: R$ 150&#10;Clareamento: R$ 800" /></label>
        <label className={labelClass}>Políticas (pagamento, entrega, trocas, cancelamento)<textarea rows={3} maxLength={4000} value={profile.policies} onChange={e => setField('policies', e.target.value)} className={inputClass} /></label>
        <label className={labelClass}>Saudação inicial (opcional)<input maxLength={600} value={profile.greeting_message} onChange={e => setField('greeting_message', e.target.value)} className={inputClass} placeholder="Olá! Sou a assistente virtual da empresa. Como posso ajudar?" /></label>
      </div>
      <button type="button" onClick={() => void saveProfile()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
    </section>

    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#E8F4F2] p-3 text-[#004751]"><Clock3 size={20} /></span><div><h3 className="text-sm font-bold text-[#2F316B]">Atendimento humano e transferência</h3><p className="text-xs text-slate-400">Dentro deste horário o agente pode passar a conversa para um atendente.</p></div></div>
      <label className={labelClass}>Fuso horário<select value={profile.timezone} onChange={e => setField('timezone', e.target.value)} className={inputClass}>{BRAZIL_TIMEZONES.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}{!BRAZIL_TIMEZONES.some(zone => zone.value === profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}</select></label>
      <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {WEEK_DAYS.map(({ key, label }) => {
          const day = profile.business_hours[key];
          return <div key={key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <label className="flex w-40 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={day.enabled} onChange={e => setDay(key, { enabled: e.target.checked })} />{label}</label>
            {day.enabled
              ? <div className="flex items-center gap-2 text-xs text-slate-500"><input type="time" value={day.start} onChange={e => setDay(key, { start: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />até<input type="time" value={day.end} onChange={e => setDay(key, { end: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></div>
              : <span className="text-xs text-slate-400">Sem atendimento humano</span>}
          </div>;
        })}
      </div>
      <div className="mt-4 grid gap-4">
        <label className={labelClass}>Mensagem ao transferir para um atendente (dentro do horário)<input maxLength={600} value={profile.handoff_message} onChange={e => setField('handoff_message', e.target.value)} className={inputClass} /></label>
        <label className={labelClass}>Mensagem quando pedirem um atendente fora do horário<input maxLength={600} value={profile.outside_hours_message} onChange={e => setField('outside_hours_message', e.target.value)} className={inputClass} /></label>
      </div>
      <button type="button" onClick={() => void saveProfile()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#003B44] disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
    </section>

    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#FCEAF7] p-3 text-[#CB0A9F]"><BookOpen size={20} /></span><div><h3 className="text-sm font-bold text-[#2F316B]">Base de conhecimento</h3><p className="text-xs text-slate-400">Perguntas frequentes, regras, horários especiais, convênios, prazos...</p></div></div>
        <p className={overBudget ? 'text-xs font-semibold text-rose-600' : 'text-xs text-slate-400'}>{used.toLocaleString('pt-BR')} de {MAX_KNOWLEDGE_CHARS.toLocaleString('pt-BR')} caracteres{overBudget ? ' (o excedente não será enviado ao agente)' : ''}</p></div>
      <ul className="space-y-3">
        {items.length === 0 && <li className="rounded-xl bg-[#FAFBFD] p-4 text-xs text-slate-400">Nenhum item ainda. Adicione abaixo as respostas que o agente deve conhecer.</li>}
        {items.map(item => <li key={item.id} className={item.is_active ? 'rounded-xl border border-slate-200 p-4' : 'rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 opacity-70'}>
          {editingId === item.id
            ? <div className="space-y-3"><input maxLength={160} value={editDraft.title} onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} className={inputClass} /><textarea rows={4} maxLength={6000} value={editDraft.content} onChange={e => setEditDraft(d => ({ ...d, content: e.target.value }))} className={inputClass} />
                <div className="flex gap-2"><button type="button" disabled={saving || !editDraft.title.trim() || !editDraft.content.trim()} onClick={() => void saveItem(item.id, { title: editDraft.title.trim(), content: editDraft.content.trim() })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#004751] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save size={13} />Salvar</button><button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><X size={13} />Cancelar</button></div></div>
            : <div><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-800">{item.title}</p><div className="flex shrink-0 items-center gap-1">
                <label className="mr-2 flex items-center gap-1.5 text-[11px] text-slate-500"><input type="checkbox" checked={item.is_active} disabled={saving} onChange={e => void saveItem(item.id, { is_active: e.target.checked })} />Ativo</label>
                <button type="button" title="Editar" onClick={() => { setEditingId(item.id); setEditDraft({ title: item.title, content: item.content }); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={14} /></button>
                <button type="button" title="Remover" disabled={saving} onClick={() => void removeItem(item.id)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button></div></div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.content}</p></div>}
        </li>)}
      </ul>
      <form onSubmit={e => void addItem(e)} className="mt-5 space-y-3 rounded-xl bg-[#FAFBFD] p-4">
        <label className={labelClass}>Título<input maxLength={160} value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} className={inputClass} placeholder="Ex.: Quais convênios vocês aceitam?" /></label>
        <label className={labelClass}>Resposta / conteúdo<textarea rows={4} maxLength={6000} value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} className={inputClass} /></label>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#2F316B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#25275B] disabled:opacity-50"><Plus size={14} />Adicionar item</button>
      </form>
    </section>
  </div>;
}
