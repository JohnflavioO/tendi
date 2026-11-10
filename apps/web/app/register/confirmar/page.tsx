'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { readPendingSignupEmail } from '@/lib/pending-signup';

const RESEND_WAIT_SECONDS = 60;

export default function ConfirmEmailPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setEmail(readPendingSignupEmail()); }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait(current => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setError('');
    setNotice('');
    setSending(true);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) throw resendError;
      setNotice('Enviamos um novo link de confirmação.');
      setWait(RESEND_WAIT_SECONDS);
    } catch {
      setError('Não foi possível reenviar agora. Aguarde alguns minutos e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F7FB] text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="rounded-xl bg-[#2F316B] p-2.5 text-white"><MessageCircle size={20}/></span>
            <span className="text-xl font-bold text-[#2F316B]">Tendi</span>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-[#004751] hover:underline">Já confirmei, entrar</Link>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-12 sm:py-20">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><MailCheck size={28}/></span>
          <h1 className="mt-5 text-2xl font-bold text-[#25275B]">Confirme seu e-mail para continuar</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Sua conta foi criada. Enviamos um link de confirmação para {email ? 'o endereço abaixo' : 'o e-mail informado no cadastro'}.
            Abra a mensagem e clique no link para ativar a conta e iniciar o teste gratuito.
          </p>
          {email && <p className="mt-4 break-words rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#25275B]">{email}</p>}

          <ul className="mt-6 space-y-2 rounded-xl bg-[#F7F8FC] p-4 text-left text-sm leading-6 text-slate-600">
            <li>• O e-mail pode levar alguns minutos para chegar.</li>
            <li>• Confira também a caixa de spam ou promoções.</li>
            <li>• Abra o link no mesmo navegador em que você fez o cadastro.</li>
          </ul>

          {notice && <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {email ? (
            <button
              type="button"
              onClick={resend}
              disabled={sending || wait > 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#004751] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? <Loader2 className="animate-spin" size={16}/> : wait > 0 ? `Reenviar e-mail em ${wait}s` : 'Reenviar e-mail de confirmação'}
            </button>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Não recebeu? <Link href="/register" className="font-semibold text-[#004751] hover:underline">Volte ao cadastro</Link> e tente novamente.</p>
          )}

          <p className="mt-5 text-xs leading-5 text-slate-400">
            E-mail errado? <Link href="/register" className="font-semibold text-[#004751] hover:underline">Refazer o cadastro</Link>
            {' · '}Precisa de ajuda? <a href="mailto:suporte@tendi.app" className="font-semibold text-[#004751] hover:underline">suporte@tendi.app</a>
          </p>
        </section>
      </div>
    </main>
  );
}
