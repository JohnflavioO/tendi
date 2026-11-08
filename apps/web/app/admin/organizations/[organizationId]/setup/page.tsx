'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Organization = { id: string; name: string };

export default function OrganizationSetupPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/login'); return; }
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!admin) { router.replace('/inbox'); return; }
      const { data, error: orgError } = await supabase.from('organizations').select('id,name').eq('id', params.organizationId).single();
      if (orgError) setError(orgError.message);
      else setOrganization(data as Organization);
      setLoading(false);
    }
    void load();
  }, [params.organizationId, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`/api/admin/organizations/${params.organizationId}/invite-admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o convite.');
      setSuccess(result.message);
      setFullName(''); setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a configuração.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#F7F8FC] text-[#2F316B]"><Loader2 className="animate-spin"/></main>;

  return <main className="min-h-screen bg-[#F7F8FC] px-5 py-10 text-slate-800">
    <div className="mx-auto max-w-2xl">
      <a href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#2F316B]"><ArrowLeft size={16}/> Voltar às empresas</a>
      <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#edf0fb] text-[#2F316B]"><ShieldCheck size={23}/></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">Configuração inicial</p>
        <h1 className="mt-2 text-2xl font-bold text-[#2F316B]">{organization?.name ?? 'Empresa'}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Convide o responsável pela operação. Ele receberá um link por e-mail para ativar o acesso como administrador da empresa.</p>

        {success ? <div role="status" className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 size={19}/> Etapa concluída</div><p className="mt-2 text-sm text-emerald-800">{success}</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => setSuccess('')} className="rounded-lg bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white">Convidar outra pessoa</button><a href={`/inbox?organization=${params.organizationId}`} className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-900">Abrir Inbox</a></div></div> : <form onSubmit={submit} className="mt-7 space-y-5">
          <div><label htmlFor="admin-name" className="text-sm font-semibold text-slate-700">Nome do administrador</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3"><UserRound size={17} className="text-slate-400"/><input id="admin-name" required minLength={2} maxLength={120} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome completo" className="w-full py-3 text-sm outline-none"/></div></div>
          <div><label htmlFor="admin-email" className="text-sm font-semibold text-slate-700">E-mail de acesso</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Mail size={17} className="text-slate-400"/><input id="admin-email" required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="administrador@empresa.com.br" className="w-full py-3 text-sm outline-none"/></div></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={sending || !organization} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{sending ? <Loader2 className="animate-spin" size={17}/> : <Mail size={17}/>} {sending ? 'Preparando convite...' : 'Enviar convite e vincular administrador'}</button>
        </form>}
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">O administrador será vinculado à empresa e à equipe principal de atendimento.</p>
    </div>
  </main>;
}
