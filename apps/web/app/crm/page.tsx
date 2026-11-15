'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search, KanbanSquare, Loader2, MessageCircle, Target, CircleDot, Wallet, Trophy } from 'lucide-react';
import { Badge, EmptyState, Metric } from '@/components/ui';
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

  return <WorkspaceShell title="CRM" description="Pipeline comercial e gestão das oportunidades" actions={<Badge tone="indigo" className="hidden !px-3 !py-1.5 sm:inline-flex"><KanbanSquare size={13} />Pipeline de vendas</Badge>}>
    {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-tendi-indigo" /></div> : <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Metric label="Oportunidades" value={deals.length} icon={Target} hint="No funil de vendas" />
        <Metric label="Em aberto" value={open.length} icon={CircleDot} hint="Ainda em negociação" />
        <Metric label="Valor em aberto" value={formatBRL(sum(open))} icon={Wallet} tone="teal" accent hint="Soma das etapas abertas" />
        <Metric label="Ganho" value={formatBRL(sum(won))} icon={Trophy} tone="magenta" hint="Negócios fechados" />
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full sm:max-w-sm"><span className="sr-only">Buscar oportunidade</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título, contato ou telefone" className="td-input pl-9" /></label>
        <p className="hidden text-xs text-slate-400 md:block">Use “Mover para” em cada card para trocar de etapa.</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-inset ring-rose-600/10">{error}</p>}
      {!stages.length ? <div className="td-card"><EmptyState icon={KanbanSquare} title="Pipeline ainda não configurado" description="Configure as etapas do seu funil para começar a acompanhar oportunidades." /></div> : <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">{stages.map(stage => {
        const inStage = deals.filter(d => d.stage_id === stage.id);
        const items = inStage.filter(d => !query || [d.title, d.contacts?.full_name ?? '', d.contacts?.phone_e164 ?? ''].some(v => v.toLowerCase().includes(query)));
        const total = sum(inStage);
        return <section key={stage.id} className="flex w-[292px] shrink-0 snap-start flex-col rounded-card bg-[#EEEFF6] p-2 ring-1 ring-inset ring-tendi-line/70">
          <header className="relative mb-2 overflow-hidden rounded-[14px] bg-white px-3.5 pb-3 pt-3.5 shadow-card">
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: stage.color }} />
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-tendi-navy"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} /><span className="truncate">{stage.name}</span></h2>
              <span className="rounded-full bg-tendi-haze px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500 ring-1 ring-inset ring-tendi-line">{inStage.length}</span>
            </div>
            <p className="mt-1 text-[12px] font-semibold tabular-nums text-slate-500">{formatBRL(total)}</p>
          </header>
          <div className="space-y-2">{items.map(d => <article key={d.id} className="td-card-hover rounded-[14px] border border-tendi-line/70 bg-white p-3.5 shadow-card">
            <TitleEditor value={d.title} onSave={title => patch(d.id, { title })} />
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{d.contacts?.full_name ?? 'Sem contato vinculado'}{d.contacts?.phone_e164 && d.contacts.phone_e164.replace(/\D/g, '') !== d.contacts.full_name.replace(/\D/g, '') ? ` · ${d.contacts.phone_e164}` : ''}</p>
            {(d.contacts?.tags ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{(d.contacts?.tags ?? []).slice(0, 4).map(tag => <span key={tag} className="td-badge td-badge-indigo !text-[10px]">{tag}</span>)}</div>}
            <div className="mt-3"><AmountEditor value={d.amount} onSave={amount => patch(d.id, { amount })} /></div>
            <div className="mt-3 flex items-center gap-2 border-t border-tendi-line/60 pt-3">
              <select value={d.stage_id} onChange={e => void move(d.id, e.target.value)} aria-label="Mover para outra etapa" className="td-input h-8 min-w-0 flex-1 rounded-lg !text-[11.5px]"><option value={d.stage_id}>Mover para...</option>{stages.filter(s => s.id !== d.stage_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              {d.contact_id && <Link href={`/inbox?organization=${encodeURIComponent(org)}&contact=${d.contact_id}`} title="Abrir conversa" aria-label="Abrir conversa" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-tendi-line text-tendi-teal transition hover:border-tendi-teal/30 hover:bg-tendi-tealsoft"><MessageCircle size={14} /></Link>}
            </div>
          </article>)}</div>
          {!items.length && <p className="rounded-[14px] border border-dashed border-slate-300/80 px-3 py-8 text-center text-[11px] text-slate-400">{inStage.length ? 'Nenhuma oportunidade com essa busca' : 'Nenhuma oportunidade nesta etapa'}</p>}
        </section>;
      })}</div>}
    </>}
  </WorkspaceShell>;
}
