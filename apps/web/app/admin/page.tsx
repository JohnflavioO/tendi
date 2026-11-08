'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, ExternalLink, Loader2, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Organization = { id: string; name: string; slug: string; status: string; plan_code: string; created_at: string };

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [createdOrganization, setCreatedOrganization] = useState<Organization | null>(null);

  const customerOrganizations = useMemo(() => organizations.filter(org => org.slug !== 'tendi'), [organizations]);
  const internalOrganization = useMemo(() => organizations.find(org => org.slug === 'tendi'), [organizations]);

  async function load() {
    const supabase = createClient() as any;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { window.location.assign('/login'); return; }
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
    if (!admin) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);
    const { data, error: queryError } = await supabase.from('organizations').select('id,name,slug,status,plan_code,created_at').order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    setOrganizations((data ?? []) as Organization[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) return;
    setSaving(true); setError(''); setCreatedOrganization(null);
    const supabase = createClient() as any;
    let organizationId = '';
    try {
      const baseSlug = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = baseSlug + '-' + Math.random().toString(36).slice(2, 6);
      const { data: organization, error: orgError } = await supabase.from('organizations').insert({ name: cleanName, slug, status: 'active', plan_code: 'starter' }).select('id,name,slug,status,plan_code,created_at').single();
      if (orgError) throw orgError;
      organizationId = organization.id;
      const { error: teamError } = await supabase.from('teams').insert({ organization_id: organizationId, name: 'Atendimento', description: 'Equipe principal de atendimento', color: '#004751' });
      if (teamError) throw teamError;
      const { data: pipeline, error: pipelineError } = await supabase.from('crm_pipelines').insert({ organization_id: organizationId, name: 'Vendas', is_default: true }).select('id').single();
      if (pipelineError) throw pipelineError;
      const stageRows = [
        { name: 'Novo lead', position: 0, color: '#2F316B', final_type: 'open' },
        { name: 'Contato feito', position: 1, color: '#004751', final_type: 'open' },
        { name: 'Proposta enviada', position: 2, color: '#CB0A9F', final_type: 'open' },
        { name: 'Em negociação', position: 3, color: '#2F316B', final_type: 'open' },
        { name: 'Fechado', position: 4, color: '#004751', final_type: 'won' },
        { name: 'Perdido', position: 5, color: '#64748b', final_type: 'lost' },
      ].map(stage => ({ ...stage, organization_id: organizationId, pipeline_id: pipeline.id }));
      const { error: stagesError } = await supabase.from('crm_stages').insert(stageRows);
      if (stagesError) throw stagesError;
      setName('');
      setCreatedOrganization(organization as Organization);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32}/><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Esta área é exclusiva do Super Admin da plataforma.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  const inboxUrl = (id: string) => `/inbox?organization=${encodeURIComponent(id)}`;

  return <main className="min-h-screen bg-[#F7F8FC] text-slate-800">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-[#2F316B] p-2.5 text-white"><Building2 size={20}/></span><div><p className="text-lg font-bold text-[#2F316B]">Tendi <span className="text-sm font-medium text-[#CB0A9F]">Console</span></p><p className="text-xs text-slate-500">Administração da plataforma</p></div></div>
        <div className="flex items-center gap-2 rounded-full bg-[#edf0fb] px-3 py-2 text-xs font-semibold text-[#2F316B]"><ShieldCheck size={15}/> Super Admin</div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-6 py-9">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Console da plataforma</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-[#2F316B]">Empresas</h1><p className="mt-2 text-sm text-slate-500">Cadastre clientes e acesse o ambiente de cada operação.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><Building2 size={17} className="text-[#004751]"/><span className="font-semibold text-[#2F316B]">{customerOrganizations.length}</span><span className="text-slate-500">empresas clientes</span></div>
      </div>

      {createdOrganization && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={21}/><div><p className="font-semibold text-emerald-900">{createdOrganization.name} foi criada.</p><p className="mt-1 text-sm text-emerald-800">A equipe de atendimento e o pipeline comercial já estão prontos. O próximo passo é entrar no ambiente da empresa.</p></div></div>
        <a href={inboxUrl(createdOrganization.id)} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white hover:bg-[#003b43]">Acessar empresa <ArrowRight size={16}/></a>
        <button onClick={() => setCreatedOrganization(null)} aria-label="Fechar aviso" className="rounded-lg p-1 text-emerald-700"><X size={16}/></button>
      </div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-bold text-[#2F316B]">Empresas clientes</h2><p className="mt-1 text-xs text-slate-500">Cada empresa possui seu próprio ambiente.</p></div><span className="rounded-full bg-[#edf0fb] px-3 py-1 text-xs font-semibold text-[#2F316B]">{customerOrganizations.length}</span></div>
          {customerOrganizations.length ? <div className="divide-y divide-slate-100">{customerOrganizations.map(org => <article key={org.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f2fa] text-[#2F316B]"><Building2 size={20}/></span><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{org.name}</p><p className="mt-1 text-xs text-slate-400">{org.slug} · Plano {org.plan_code}</p></div></div>
            <div className="flex items-center gap-3"><span className={org.status === 'active' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'}>{org.status === 'active' ? 'Ativa' : org.status}</span><a href={inboxUrl(org.id)} className="inline-flex items-center gap-2 rounded-lg border border-[#004751]/20 px-3 py-2 text-xs font-semibold text-[#004751] hover:bg-[#eff8f7]">Abrir ambiente <ExternalLink size={14}/></a></div>
          </article>)}</div> : <div className="px-6 py-14 text-center"><Building2 className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-semibold text-slate-700">Nenhuma empresa cliente ainda</p><p className="mt-1 text-sm text-slate-500">Use o formulário ao lado para cadastrar a primeira.</p></div>}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><span className="rounded-lg bg-[#fdf0fa] p-2 text-[#CB0A9F]"><Plus size={17}/></span><h2 className="font-bold text-[#2F316B]">Nova empresa</h2></div>
          <p className="mt-3 text-sm leading-6 text-slate-500">O Tendi prepara automaticamente a equipe de atendimento e o funil inicial de vendas.</p>
          <form onSubmit={createOrganization} className="mt-6">
            <label htmlFor="company-name" className="text-sm font-semibold text-slate-700">Nome da empresa</label>
            <input id="company-name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Aurora Studio" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10"/>
            {error && <p role="alert" className="mt-3 break-words text-sm text-red-600">{error}</p>}
            <button disabled={saving || name.trim().length < 2} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#003b43] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={17}/> : <Plus size={17}/>} {saving ? 'Criando empresa...' : 'Criar empresa'}</button>
          </form>
          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400"><Users size={15} className="mt-0.5 shrink-0"/> Depois de criar, você poderá abrir o ambiente e seguir com os próximos cadastros.</div>
        </aside>
      </div>

      {internalOrganization && <section className="mt-6 rounded-2xl border border-dashed border-[#2F316B]/20 bg-[#f0f1f9] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#2F316B]">Workspace interno</p><p className="mt-1 font-semibold text-slate-800">{internalOrganization.name}</p><p className="mt-1 text-xs text-slate-500">Ambiente interno da plataforma para administração e testes. Não é uma empresa cliente.</p></div><a href={inboxUrl(internalOrganization.id)} className="inline-flex items-center gap-2 rounded-lg border border-[#2F316B]/20 bg-white px-3 py-2 text-xs font-semibold text-[#2F316B]">Abrir workspace <ArrowRight size={14}/></a></div></section>}
    </div>
  </main>;
}
