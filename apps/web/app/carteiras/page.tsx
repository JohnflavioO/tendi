'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRightLeft, Loader2, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';

type Member = { userId: string; name: string; role: string; count: number };
type Contact = { id: string; full_name: string; owner_id: string | null; created_at: string };
type Transfer = { id: string; contact_id: string; from_user_id: string | null; to_user_id: string; authorized_by: string; reason: string; created_at: string };
type Overview = { privateModeEnabled: boolean; transfersEnabled: boolean; contacts: Contact[]; contactsCapped: boolean; members: Member[]; transfers: Transfer[] };

export default function PortfolioPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contactId, setContactId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload(orgId: string) {
    const response = await fetch(`/api/portfolio?organization=${encodeURIComponent(orgId)}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao carregar carteiras.');
    setData(result as Overview);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient() as any;
        const { data: orgs } = await supabase.from('organizations').select('id').order('name');
        const requested = new URLSearchParams(window.location.search).get('organization');
        const orgId = (orgs ?? []).find((o: { id: string }) => o.id === requested)?.id ?? orgs?.[0]?.id;
        if (!orgId || !active) return;
        setOrganizationId(orgId);
        await reload(orgId);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Erro inesperado.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const memberNames = useMemo(() => new Map((data?.members ?? []).map(m => [m.userId, m.name])), [data]);
  const contactNames = useMemo(() => new Map((data?.contacts ?? []).map(c => [c.id, c.full_name])), [data]);
  async function transfer(event: React.FormEvent) {
    event.preventDefault();
    if (!organizationId || !contactId || !toUserId || reason.trim().length < 10) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/portfolio/transfer', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, contactId, toUserId, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao transferir.');
      setNotice('Carteira transferida com registro de auditoria.');
      setContactId(''); setToUserId(''); setReason('');
      await reload(organizationId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao transferir.'); }
    finally { setSaving(false); }
  }

  return <WorkspaceShell title="Carteiras comerciais" description="Acompanhe responsáveis, transferências e histórico">
    <div className="mb-5"><Link href={`/equipe?organization=${encodeURIComponent(organizationId)}`} className="inline-flex items-center gap-2 text-sm text-tendi-indigo"><ArrowLeft size={15}/> Voltar à equipe</Link></div>
    {loading && <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-tendi-indigo"/></div>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
    {data && <div className="space-y-5">
      <section className="td-card p-5">
        <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-tendi-indigo"/><h2 className="td-title">Estado da privacidade</h2></div>
        <p className="mt-2 text-sm text-slate-600">{data.privateModeEnabled ? 'Modo privado habilitado nesta empresa.' : 'Modo compartilhado: privacidade por vendedor ainda não ativada.'}</p>
        <p className="mt-1 text-xs text-slate-500">A ativação não é feita nesta tela. É necessária a validação completa de segurança antes da liberação.</p>
      </section>
      <section className="td-card p-5">
        <h2 className="td-title flex items-center gap-2"><Users size={18}/> Responsáveis</h2>
        <p className="mt-1 text-xs text-slate-500">Contagem dos primeiros 500 contatos carregados, não necessariamente da carteira inteira.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.members.map(m => <div key={m.userId} className="rounded-xl border border-tendi-line p-4"><p className="text-sm font-semibold text-slate-800">{m.name}</p><p className="text-xs text-slate-500">{m.role}</p><p className="mt-2 text-xl font-bold text-tendi-indigo">{m.count} <span className="text-xs font-normal text-slate-500">contatos na amostra</span></p></div>)}
        </div>
        {data.contactsCapped && <p className="mt-3 text-xs text-amber-700">Lista limitada a 500 contatos. Use uma visão paginada antes de considerar estes números como totais.</p>}
      </section>
      <section className="td-card p-5">
        <h2 className="td-title flex items-center gap-2"><ArrowRightLeft size={18}/> Transferir carteira</h2>
        <p className="mt-1 text-xs text-slate-500">Somente supervisores e administradores autorizados. A transferência inclui conversas e oportunidades vinculadas ao contato.</p>
        <form onSubmit={transfer} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Contato<select required value={contactId} onChange={e=>setContactId(e.target.value)} className="td-input mt-1"><option value="">Selecione um contato</option>{data.contacts.map(c=><option key={c.id} value={c.id}>{c.full_name} — {memberNames.get(c.owner_id ?? '') ?? 'Sem responsável'}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Novo responsável<select required value={toUserId} onChange={e=>setToUserId(e.target.value)} className="td-input mt-1"><option value="">Selecione um membro ativo</option>{data.members.map(m=><option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">Motivo da transferência<textarea required minLength={10} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className="td-input mt-1 min-h-24" placeholder="Explique o motivo da transferência"/></label>
          <button type="submit" disabled={saving || !data.transfersEnabled} className="td-btn td-btn-teal w-fit">{saving && <Loader2 size={15} className="animate-spin"/>} Confirmar transferência</button>
        </form>
        {!data.transfersEnabled && <p className="mt-3 text-xs text-amber-700">Transferências não configuradas nesta empresa.</p>}
      </section>
      <section className="td-card p-5">
        <h2 className="td-title">Últimas transferências</h2>
        <div className="mt-3 space-y-3">{data.transfers.map(t=><article key={t.id} className="rounded-xl border border-tendi-line p-3 text-sm"><p className="font-semibold">{contactNames.get(t.contact_id) ?? 'Contato'}: {memberNames.get(t.from_user_id ?? '') ?? 'Sem responsável'} → {memberNames.get(t.to_user_id) ?? 'Usuário'}</p><p className="mt-1 text-xs text-slate-600">{t.reason}</p><p className="mt-1 text-xs text-slate-400">{new Date(t.created_at).toLocaleString('pt-BR')} · autorizado por {memberNames.get(t.authorized_by) ?? 'Gestor'}</p></article>)}{!data.transfers.length && <p className="text-sm text-slate-500">Nenhuma transferência registrada.</p>}</div>
      </section>
    </div>}
  </WorkspaceShell>;
}
