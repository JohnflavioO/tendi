'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('john.flavio@gmail.com');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('John Flavio');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === 'signup') {
        if (email.trim().toLowerCase() !== 'john.flavio@gmail.com') {
          throw new Error('O cadastro inicial está restrito ao e-mail autorizado do Super Admin.');
        }
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signupError) throw signupError;
        setNotice('Enviamos um link de confirmação para seu e-mail. Confirme o endereço para ativar o acesso de Super Admin.');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginError) throw loginError;
        router.replace('/inbox');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
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
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">{mode === 'signin' ? 'Acesse sua conta' : 'Ative seu acesso'}</h2>
          <p className="mt-2 text-sm text-slate-500">{mode === 'signin' ? 'Entre para continuar seus atendimentos.' : 'Crie o primeiro acesso administrativo da plataforma.'}</p>

          {mode === 'signup' && <>
            <label className="mt-7 block text-sm font-medium text-slate-700">Nome completo</label>
            <input required value={fullName} onChange={e => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" />
          </>}

          <label className="mt-7 block text-sm font-medium text-slate-700">E-mail</label>
          <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" />
          <label className="mt-5 block text-sm font-medium text-slate-700">Senha</label>
          <input required minLength={8} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10" />

          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

          <button disabled={loading} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 font-semibold text-white transition hover:bg-[#003943] disabled:opacity-60">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <>{mode === 'signin' ? 'Entrar' : 'Criar acesso Super Admin'} <ArrowRight size={18} /></>}
          </button>
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }} className="mt-5 w-full text-sm font-semibold text-[#2F316B] hover:underline">
            {mode === 'signin' ? 'Primeiro acesso do Super Admin? Criar conta' : 'Já possui acesso? Entrar'}
          </button>
          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={15} /> Autenticação protegida pelo Supabase Auth</div>
          <p className="mt-3 text-center text-[11px] text-slate-400">O cadastro inicial é restrito ao e-mail previamente autorizado.</p>
        </form>
      </section>
    </main>
  );
}
