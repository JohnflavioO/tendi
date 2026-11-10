'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTrialDays } from '@/lib/use-trial-days';
import { provisionPendingWorkspace } from '@/lib/ensure-workspace';
import { trialDaysLabel } from '@/lib/trial';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const trialLabel = trialDaysLabel(useTrialDays());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginError) throw loginError;
      const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (!admin) {
        // Conta confirmada sem empresa: conclui a criação do workspace iniciada no cadastro.
        // Se falhar aqui, a Inbox tenta de novo e mostra o motivo.
        try {
          const { data: organizations } = await supabase.from('organizations').select('id').limit(1);
          if (organizations && organizations.length === 0) await provisionPendingWorkspace(supabase as any, data.user);
        } catch (provisionError) {
          console.error('Falha ao criar o workspace no login:', provisionError);
        }
      }
      router.replace(admin ? '/admin' : '/inbox');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar. Confira seus dados.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#2F316B] p-14 text-white lg:flex">
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-40 -left-20 h-[30rem] w-[30rem] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3 text-2xl font-bold">
          <span className="rounded-xl bg-white/10 p-3"><MessageCircle /></span>Tendi
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[.22em] text-[#F4A8E1]">Atendimento que aproxima</p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight">Boas conversas criam grandes negócios.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/75">Organize conversas, acompanhe oportunidades e mantenha sua equipe conectada em um só lugar.</p>
          <div className="mt-10 h-1.5 w-32 rounded-full bg-[#CB0A9F]" />
        </div>
        <p className="relative text-sm text-white/55">Tendi · Atendimento e CRM conversacional</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 text-2xl font-bold text-[#2F316B] lg:hidden"><MessageCircle />Tendi</div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#004751]">Bem-vindo ao Tendi</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Acesse sua conta</h2>
          <p className="mt-2 text-sm text-slate-500">Entre para continuar seus atendimentos ou administrar a plataforma.</p>

          <label className="mt-8 block text-sm font-medium text-slate-700">E-mail</label>
          <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="voce@empresa.com"/>
          <label className="mt-5 block text-sm font-medium text-slate-700">Senha</label>
          <input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" placeholder="Sua senha"/>

          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button disabled={loading} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 font-semibold text-white transition hover:bg-[#003943] disabled:opacity-60">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <>Entrar <ArrowRight size={18} /></>}
          </button>

          <div className="mt-7 rounded-xl bg-[#F6F7FB] p-4 text-center">
            <p className="text-sm font-semibold text-[#25275B]">Ainda não tem uma conta?</p>
            <Link href="/register" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#004751] hover:underline">Comece seu teste gratuito de {trialLabel} <ArrowRight size={15}/></Link>
            <p className="mt-1 text-xs text-slate-400">Sem cartão de crédito e sem cobrança no cadastro.</p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15} /> Autenticação protegida pelo Supabase Auth</div>
        </form>
      </section>
    </main>
  );
}
