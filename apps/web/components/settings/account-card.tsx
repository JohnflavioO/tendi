'use client';

import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, Mail, PenLine, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ROLE_INFO, type Role } from '@/lib/team';

/**
 * Configurações › Sua conta: quem está logado (nome, e-mail de acesso, papel na empresa) e troca de senha.
 * Cada pessoa só altera o próprio perfil (regra do banco).
 */
export function AccountCard({ role, superAdmin }: { role?: Role | null; superAdmin?: boolean }) {
  const [user, setUser] = useState<{ id: string; email: string; createdAt: string | null } | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUser({ id: data.user.id, email: String(data.user.email ?? ''), createdAt: data.user.created_at ?? null });
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle();
      setName(String(profile?.full_name || data.user.user_metadata?.full_name || ''));
    })().catch(() => undefined);
  }, []);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next.length < 2) { setMessage({ ok: false, text: 'Use pelo menos 2 letras no nome.' }); return; }
    if (!user) return;
    setBusy('name'); setMessage(null);
    const { error } = await (createClient() as any).from('profiles').update({ full_name: next.slice(0, 80) }).eq('id', user.id);
    setBusy('');
    if (error) { setMessage({ ok: false, text: 'Não foi possível salvar o nome.' }); return; }
    setName(next); setEditingName(false);
    setMessage({ ok: true, text: 'Nome atualizado.' });
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setMessage({ ok: false, text: 'A senha precisa ter pelo menos 8 caracteres.' }); return; }
    if (password !== confirm) { setMessage({ ok: false, text: 'As senhas não conferem.' }); return; }
    setBusy('password'); setMessage(null);
    const { error } = await (createClient() as any).auth.updateUser({ password });
    setBusy('');
    if (error) { setMessage({ ok: false, text: /same/i.test(error.message) ? 'Escolha uma senha diferente da atual.' : 'Não foi possível alterar a senha.' }); return; }
    setPassword(''); setConfirm(''); setChangingPassword(false);
    setMessage({ ok: true, text: 'Senha alterada. Use a nova senha no próximo login.' });
  }

  const roleLabel = superAdmin && !role ? 'Super Admin' : role ? ROLE_INFO[role].label : '—';
  const initials = (name || user?.email || '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const input = 'td-input';

  return <section className="td-card p-5 xl:col-span-2" data-tour="account">
    <div className="flex flex-wrap items-start gap-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2F316B] to-tendi-magenta text-lg font-bold text-white">{initials}</span>
      <div className="min-w-0 flex-1">
        <p className="td-eyebrow">Sua conta</p>
        {editingName
          ? <form onSubmit={saveName} className="mt-1 flex max-w-md items-center gap-2"><input autoFocus value={draft} maxLength={80} onChange={e => setDraft(e.target.value)} className={input} aria-label="Seu nome" /><button disabled={busy !== ''} aria-label="Salvar nome" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50">{busy === 'name' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}</button><button type="button" onClick={() => setEditingName(false)} aria-label="Cancelar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={16} /></button></form>
          : <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold tracking-tight text-tendi-navy">{name || 'Sem nome'}<button type="button" onClick={() => { setDraft(name); setEditingName(true); }} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-tendi-teal hover:bg-tendi-tealsoft"><PenLine size={12} />editar</button></p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field icon={Mail} label="E-mail de acesso" value={user?.email ?? '—'} hint="É com ele que você entra no TendiDesk." />
          <Field icon={UserRound} label="Seu papel nesta empresa" value={roleLabel} hint={role ? ROLE_INFO[role].description : undefined} />
          <Field icon={KeyRound} label="Conta criada em" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
        </div>
        {changingPassword
          ? <form onSubmit={savePassword} className="mt-4 grid max-w-xl gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="password" autoComplete="new-password" placeholder="Nova senha (mín. 8)" value={password} onChange={e => setPassword(e.target.value)} className={input} aria-label="Nova senha" />
              <input type="password" autoComplete="new-password" placeholder="Confirme a nova senha" value={confirm} onChange={e => setConfirm(e.target.value)} className={input} aria-label="Confirme a nova senha" />
              <div className="flex gap-1"><button disabled={busy !== ''} className="td-btn td-btn-teal  disabled:opacity-50">{busy === 'password' && <Loader2 size={13} className="animate-spin" />}Salvar</button><button type="button" onClick={() => setChangingPassword(false)} className="rounded-xl px-3 text-xs text-slate-500 hover:bg-slate-100">Cancelar</button></div>
            </form>
          : <button type="button" onClick={() => setChangingPassword(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-tendi-line px-3.5 py-2 text-xs font-semibold text-tendi-indigo hover:bg-tendi-haze"><KeyRound size={14} />Alterar senha</button>}
        {message && <p role="status" className={message.ok ? 'mt-3 text-xs text-emerald-700' : 'mt-3 text-xs text-rose-600'}>{message.text}</p>}
      </div>
    </div>
  </section>;
}

function Field({ icon: Icon, label, value, hint }: { icon: typeof Mail; label: string; value: string; hint?: string }) {
  return <div className="td-subtle p-3">
    <p className="flex items-center gap-1.5 td-eyebrow"><Icon size={12} />{label}</p>
    <p className="mt-1 break-all text-sm font-semibold text-slate-800">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{hint}</p>}
  </div>;
}
