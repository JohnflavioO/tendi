'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Primeiro acesso de quem foi convidado para uma equipe: cria a senha e entra no Inbox. */
export default function SetPasswordPage() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Veio de "Esqueci minha senha" (não é convite).
  const [reset, setReset] = useState(false);

  useEffect(() => {
    setReset(new URLSearchParams(window.location.search).get('modo') === 'redefinir');
    (async () => {
      const supabase = createClient() as any;
      const { data } = await supabase.auth.getUser();
      if (!data.user) { window.location.assign('/login'); return; }
      setName(String(data.user.user_metadata?.full_name ?? '').split(' ')[0] ?? '');
      setCompany(String(data.user.user_metadata?.organization_name ?? '').trim());
      setAsAdmin(Boolean(data.user.user_metadata?.invite_role));
    })();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use pelo menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    setSaving(true);
    const supabase = createClient() as any;
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { needs_password: false } });
    if (updateError) { setSaving(false); setError(updateError.message.includes('same') ? 'Escolha uma senha diferente da anterior.' : 'Não foi possível salvar a senha. Tente novamente.'); return; }
    if (reset) {
      const { data: auth } = await supabase.auth.getUser();
      const { data: admin } = auth?.user ? await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle() : { data: null };
      window.location.assign(admin ? '/admin' : '/inbox');
      return;
    }
    window.location.assign('/inbox?welcome=1');
  }

  const field = 'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#004751] focus:ring-2 focus:ring-[#004751]/10';

  return <main className="grid min-h-screen place-items-center bg-[#F5F6FB] p-6 text-slate-800">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <img src="/brand/Logo%20Tendi.png" alt="Tendi" width="797" height="304" className="h-9 w-auto object-contain" />
      <span className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-[#E8F4F2] text-[#004751]"><KeyRound size={22} /></span>
      <h1 className="mt-4 text-2xl font-bold text-[#25275B]">{reset ? 'Crie uma nova senha' : name ? `Boas-vindas, ${name}!` : 'Boas-vindas!'}</h1>
      {reset ? <p className="mt-2 text-sm leading-6 text-slate-500">Escolha uma nova senha para a sua conta{name ? `, ${name}` : ''}. Depois de salvar, você já entra no Tendi.</p> : <p className="mt-2 text-sm leading-6 text-slate-500">{company ? <>Você foi convidado(a) para {asAdmin ? 'administrar a conta da empresa' : 'a equipe da empresa'} <strong className="text-[#25275B]">{company}</strong> no Tendi.</> : 'Você foi convidado(a) para a equipe no Tendi.'} Crie a sua senha para entrar sempre que precisar.</p>}
      <label className="mt-6 block text-sm font-semibold text-slate-700">Nova senha<input required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={field} placeholder="Mínimo de 8 caracteres" /></label>
      <label className="mt-4 block text-sm font-semibold text-slate-700">Confirme a senha<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={field} /></label>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button disabled={saving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white hover:bg-[#003943] disabled:opacity-50">{saving && <Loader2 size={16} className="animate-spin" />}{reset ? 'Salvar nova senha' : 'Criar senha e entrar'}</button>
    </form>
  </main>;
}
