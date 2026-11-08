'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Plus, ShieldCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Organization = { id: string; name: string; slug: string; status: string; plan_code: string; created_at: string };

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    setSaving(true); setError(''); setNotice('');
    try {
      const supabase = createClient();
      const slug = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { data: organization, error: orgError } = await supabase.from('organizations').insert({ name: name.trim(), slug, status: 'active', plan_code: 'starter' }).select('id').single();
      if (orgError) throw orgError;
      const { error: teamError } = await supabase.from('teams').insert({ organization_id: organization.id, name: 'Atendimento', description: 'Equipe principal de atendimento', color: '#004751' });
      if (teamError) throw teamError;
      const { data: pipeline, error: pipelineError } = await supabase.from('crm_pipelines').insert({ organization_id: organization.id, name: 'Vendas', is_default: true }).select('id').single();
      if (pipelineError) throw pipelineError;
      const stageRows = [
        { name: 'Novo lead', position: 0, color: '#2F316B', final_type: 'open' },
        { name: 'Contato feito', position: 1, color: '#004751', stage_type: 'open' },
        { name: 'Proposta enviada', position: 2, color: '#CB0A9F', stage_type: 'open' },
        { name: 'Em negociação', position: 3, color: '#2F316B', stage_type: 'open' },
        { name: 'Fechado', position: 4, color: '#004751', final_type: 'won' },
        { name: 'Perdido', position: 5, color: '#64748b', final_type: 'lost' },
      ].map(stage => ({ ...stage, organization_id: organization.id, pipeline_id: pipeline.id }));
      const { error: stagesError } = await supabase.from('crm_stages').insert(stageRows);
      if (stagesError) throw stagesError;
      setName('');
      setNotice('Empresa criada com equipe e pipeline comercial inicial.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] text-[#2F316B]"><Loader2 className="animate-spin" /></main>;
  if (!authorized) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] p-6"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto text-[#CB0A9F]" size={32}/><h1 className="mt-4 text-xl font-semibold text-[#2F316B]">Acesso restrito</h1><p className="mt-2 text-sm text-slate-500">Esta área é exclusiva do Super Admin da plataforma.</p><a href="/inbox" className="mt-5 inline-block text-sm font-semibold text-[#004751]">Voltar ao Inbox</a></div></main>;

  return <main className="min-h-screen bg-[#F7F8FC] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#2F316B] p-2.5 text-white"><Building2 size={20}/></span><div><p className="text-lg font-bold text-[#2F316B]">Tendi <span className="text-sm font-medium text-[#CB0A9F]">Console</span></p><p className="text-xs text-slate-500">Administração da plataforma</p></div></div><div className="flex items-center gap-2 rounded-full bg-[#edf0fb] px-3 py-2 text-xs font-semibold text-[#2F316B]"><ShieldCheck size={15}/> Super Admin</div></div></header>
    <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-[#2F316B]">Empresas</h1><p className="mt-1 text-sm text-slate-500">Organizações cadastradas na plataforma.</p></div><span className="rounded-full bg-[#edf0fb] px-3 py-1 text-sm font-semibold text-[#2F316B]">{organizations.length}</span></div>
        <div className="mt-6 divide-y divide-slate-100">{organizations.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center"><Building2 className="mx-auto text-slate-300" size={30}/><p className="mt-3 font-semibold text-slate-700">Nenhuma empresa cadastrada</p><p className="mt-1 text-sm text-slate-500">Crie a primeira organização para iniciar a operação do Tendi.</p></div> : organizations.map(org => <div key={org.id} className="flex items-center justify-between py-4"><div><p className="font-semibold">{org.name}</p><p className="mt-1 text-xs text-slate-400">{org.slug} · {org.plan_code}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{org.status}</span></div>)}</div>
      </section>
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Plus className="text-[#CB0A9F]" size={19}/><h2 className="font-bold text-[#2F316B]">Nova empresa</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">Cria a organização com uma equipe de atendimento e um pipeline comercial padrão.</p><form onSubmit={createOrganization} className="mt-5"><label className="text-sm font-medium">Nome da empresa</label><input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Aurora Studio" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-[#004751]"/>{error&&<p role="alert" className="mt-3 break-words text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}<button disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?<Loader2 className="animate-spin" size={17}/>:<Plus size={17}/>} Criar empresa</button></form></aside>
    </div>
  </main>;
}
