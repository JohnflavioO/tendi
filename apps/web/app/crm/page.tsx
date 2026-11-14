'use client';

import { useEffect, useState } from 'react';
import { Search, KanbanSquare, Loader2, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';
import { AmountEditor, TitleEditor } from '@/components/crm/inline-edit';
import { formatBRL } from '@/lib/money';

type Stage = { id: string; name: string; color: string; position: number; final_type: string | null };
type Deal = { id: string; title: string; amount: number; stage_id: string; contact_id: string; contacts: { full_name: string; phone_e164: string | null; tags: string[] } | null; owner_id: string | null };

const isOpenStage = (stage?: Stage) => !stage || !stage.final_type || stage.final_type === 'open';
const isWonStage = (stage?: Stage) => stage?.final_type === 'won';

export default function CrmPage() {
  const supabase = createClient() as any;
  const [org, setOrg] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: orgs } = await supabase.from('organizations').select('id').order('name');
    const requested = new URLSearchParams(window.location.search).get('organization');
    const current = orgs?.find((o: { id: string }) => o.id === requested) ?? orgs?.[0];
    if (!current) return;
    setOrg(current.id);
    const { data: p, error: pe } = await supabase.from('crm_pipelines').select('id,name').eq('organization_id', current.id).order('created_at');
    if (pe) throw pe;
    const selected = p?.[0];
    if (!selected) { setLoading(false); return; }
    const { data: s, error: se } = await supabase.from('crm_stages').select('id,name,color,position,final_type').eq('pipeline_id', selected.id).order('position');
    if (se) throw se;
    setStages(s ?? []);
    const { data: d, error: de } = await supabase.from('opportunities').select('id,title,amount,stage_id,contact_id,owner_id,contacts(full_name,phone_e164,tags)').eq('organization_id', current.id).eq('pipeline_id', selected.id).order('created_at', { ascending: false });
    if (de) throw de;
    setDeals((d ?? []) as Deal[]);
    setLoading(false);
  }
  useEffect(() => { void load().catch(e => { setError(e.message); setLoading(false); }); }, []);

  async function move(id: string, stageId: string) {
    const stage = stages.find(s => s.id === stageId);
    const { error: e } = await supabase.from('opportunities').update({ stage_id: stageId, closed_at: isOpenStage(stage) ? null : new Date().toISOString() }).eq('id', id).eq('organization_id', org);
    if (e) setError('Não foi possível mover a oportunidade.');
    else setDeals(v => v.map(d => (d.id === id ? { ...d, stage_id: stageId } : d)));
  }

  async function patch(id: string, values: Partial<Pick<Deal, 'amount' | 'title'>>): Promise<string | null> {
    const { error: e } = await supabase.from('opportunities').update(values).eq('id', id).eq('organization_id', org);
    if (e) return 'Não foi possível salvar. Tente de novo.';
    setDeals(v => v.map(d => (d.id === id ? { ...d, ...values } : d)));
    return null;
  }

  const stageOf = (deal: Deal) => stages.find(s => s.id === deal.stage_id);
  const open = deals.filter(d => isOpenStage(stageOf(d)));
  const won = deals.filter(d => isWonStage(stageOf(d)));
  const sum = (list: Deal[]) => list.reduce((total, d) => total + Number(d.amount || 0), 0);
  const query = search.trim().toLowerCase();

  return <WorkspaceShell title="CRM" description="Pipeline comercial e gestão das oportunidades" actions={<span className="hidden rounded-xl bg-[#F0F0FA] px-3 py-2 text-[11px] font-semibold text-[#2F316B] sm:inline">Pipeline de vendas</span>}>
    {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-[#2F316B]" /></div> : <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Oportunidades" value={deals.length} />
        <Metric label="Em aberto" value={open.length} />
        <Metric label="Valor em aberto" value={formatBRL(sum(open))} accent />
        <Metric label="Ganho" value={formatBRL(sum(won))} />
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:max-w-sm"><Search size={15} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar oportunidade..." className="w-full bg-transparent text-xs outline-none" /></div>
      {error && <p className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {!stages.length ? <Empty /> : <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">{stages.map(stage => {
        const inStage = deals.filter(d => d.stage_id === stage.id);
        const items = inStage.filter(d => !query || [d.title, d.contacts?.full_name ?? '', d.contacts?.phone_e164 ?? ''].some(v => v.toLowerCase().includes(query)));
        const total = sum(inStage);
        return <section key={stage.id} className="w-[280px] shrink-0 snap-start rounded-2xl border border-slate-200 bg-[#EEF0F7] p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} /><h2 className="truncate text-xs font-bold text-[#2F316B]">{stage.name}</h2></div>
              <p className="mt-1 pl-[18px] text-[11px] font-semibold text-slate-500">{formatBRL(total)}</p>
            </div>
            <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">{inStage.length}</span>
          </div>
          <div className="space-y-2">{items.map(d => <article key={d.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <TitleEditor value={d.title} onSave={title => patch(d.id, { title })} />
            <p className="mt-1 text-[10px] text-slate-400">{d.contacts?.full_name ?? 'Sem contato vinculado'}{d.contacts?.phone_e164 && d.contacts.phone_e164.replace(/\D/g, '') !== d.contacts.full_name.replace(/\D/g, '') ? ` · ${d.contacts.phone_e164}` : ''}</p>
            {(d.contacts?.tags ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{(d.contacts?.tags ?? []).slice(0, 4).map(tag => <span key={tag} className="rounded-md bg-[#F3F1FA] px-1.5 py-0.5 text-[9px] font-semibold text-[#514D82]">{tag}</span>)}</div>}
            <div className="mt-2.5"><AmountEditor value={d.amount} onSave={amount => patch(d.id, { amount })} /></div>
            <div className="mt-2.5 flex items-center gap-2">
              <select value={d.stage_id} onChange={e => void move(d.id, e.target.value)} aria-label="Mover para outra etapa" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-[#FAFBFD] px-2 py-2 text-[10px] text-slate-600"><option value={d.stage_id}>Mover para...</option>{stages.filter(s => s.id !== d.stage_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              {d.contact_id && <a href={`/inbox?organization=${encodeURIComponent(org)}&contact=${d.contact_id}`} title="Abrir conversa" aria-label="Abrir conversa" className="rounded-lg border border-slate-200 p-2 text-[#004751] hover:bg-[#E8F4F2]"><MessageCircle size={14} /></a>}
            </div>
          </article>)}</div>
          {!items.length && <p className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-[10px] text-slate-400">{inStage.length ? 'Nenhuma oportunidade com essa busca' : 'Nenhuma oportunidade nesta etapa'}</p>}
        </section>;
      })}</div>}
    </>}
  </WorkspaceShell>;
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 truncate text-lg font-bold md:text-xl ${accent ? 'text-[#004751]' : 'text-[#2F316B]'}`}>{value}</p></div>;
}

function Empty() {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><KanbanSquare className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-semibold text-slate-600">Pipeline ainda não configurado</p><p className="mt-1 text-xs text-slate-400">Configure as etapas do seu funil para começar a acompanhar oportunidades.</p></div>;
}
