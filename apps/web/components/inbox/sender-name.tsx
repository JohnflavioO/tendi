'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, PenLine, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cleanName } from '@/lib/signature';

/**
 * "Você assina como Ana": o nome do perfil é o que aparece em negrito para o cliente no WhatsApp.
 * Cada pessoa ajusta o próprio nome aqui (a regra do banco só deixa alterar o próprio perfil).
 */
export function SenderName() {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      setUserId(auth.user.id);
      const { data } = await supabase.from('profiles').select('full_name,email').eq('id', auth.user.id).maybeSingle();
      setName(String(data?.full_name || data?.email?.split('@')[0] || ''));
    })().catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next = cleanName(draft);
    if (next.length < 2) { setError('Use pelo menos 2 letras.'); return; }
    setSaving(true); setError('');
    const { error: updateError } = await (createClient() as any).from('profiles').update({ full_name: next }).eq('id', userId);
    setSaving(false);
    if (updateError) { setError('Não foi possível salvar.'); return; }
    setName(next); setEditing(false);
  }

  if (!userId) return <p className="mt-2 px-1 text-[10px] text-slate-400">As respostas saem pelo WhatsApp conectado deste workspace.</p>;

  return editing
    ? <form onSubmit={save} className="mt-2 flex items-center gap-1.5 px-1">
        <span className="text-[11px] text-slate-500">Seu nome nas mensagens:</span>
        <input autoFocus value={draft} maxLength={40} onChange={e => setDraft(e.target.value)} className="w-40 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] outline-none focus:border-[#7C7EC0]" />
        <button disabled={saving} aria-label="Salvar nome" className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
        <button type="button" onClick={() => { setEditing(false); setError(''); }} aria-label="Cancelar" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={13} /></button>
        {error && <span className="text-[11px] text-rose-600">{error}</span>}
      </form>
    : <p className="mt-2 flex items-center gap-1 px-1 text-[11px] text-slate-500">Saem pelo WhatsApp com a assinatura <b className="font-semibold text-slate-700">{cleanName(name).split(' ')[0] || 'Atendente'}</b><button type="button" onClick={() => { setDraft(name); setEditing(true); }} className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-[#004751] hover:bg-[#E8F4F2]"><PenLine size={11} />editar nome</button></p>;
}
