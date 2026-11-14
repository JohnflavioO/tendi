'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MailCheck, MailQuestion } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RESET_PASSWORD_PATH } from '@/lib/auth-redirect';

/**
 * Recuperação de senha: a pessoa informa o e-mail e recebe o link "Redefinir senha".
 * A resposta é sempre a mesma, exista ou não a conta, para não revelar quais e-mails estão cadastrados.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true); setError('');
    const supabase = createClient() as any;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(RESET_PASSWORD_PATH)}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    setSending(false);
    if (resetError && /rate limit|security purposes|too many/i.test(resetError.message)) {
      setError('Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.');
      return;
    }
    setSent(true);
  }

  const field = 'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10';

  return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6 text-slate-800">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain" />
      {sent ? <>
        <span className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><MailCheck size={22} /></span>
        <h1 className="mt-4 text-2xl font-bold text-[#25275B]">Confira o seu e-mail</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Se existir uma conta com <b className="text-slate-700">{email}</b>, enviamos um link para criar uma nova senha. Ele chega em alguns minutos e vale por tempo limitado.</p>
        <p className="mt-3 text-xs leading-5 text-slate-400">Não chegou? Veja a caixa de spam ou promoções. Se continuar sem chegar, fale com suporte@tendidesk.com.br.</p>
        <button type="button" onClick={() => { setSent(false); setEmail(''); }} className="mt-6 text-sm font-semibold text-[#004751] hover:underline">Usar outro e-mail</button>
      </> : <form onSubmit={submit}>
        <span className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-[#F0F0FA] text-[#2F316B]"><MailQuestion size={22} /></span>
        <h1 className="mt-4 text-2xl font-bold text-[#25275B]">Esqueceu a senha?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
        <label className="mt-6 block text-sm font-semibold text-slate-700">E-mail<input required type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} className={field} placeholder="voce@empresa.com.br" /></label>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button disabled={sending || !email.trim()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white hover:bg-[#003943] disabled:opacity-50">{sending && <Loader2 size={16} className="animate-spin" />}Enviar link de redefinição</button>
      </form>}
      <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#2F316B]"><ArrowLeft size={15} />Voltar para o login</Link>
    </div>
  </main>;
}
