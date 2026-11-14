'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, PenLine, X } from 'lucide-react';
import { editableBRL, formatBRL, parseBRL } from '@/lib/money';

/**
 * Valor da oportunidade com edição no lugar: toca no valor, digita, Enter (ou ✓) salva, Esc cancela.
 * `onSave` grava no banco e devolve uma mensagem de erro, ou null quando deu certo.
 */
export function AmountEditor({ value, onSave, size = 'md', label = 'Valor da oportunidade' }: {
  value: number | string | null | undefined;
  onSave: (amount: number) => Promise<string | null>;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  function start() { setDraft(editableBRL(value)); setError(''); setEditing(true); }

  async function save() {
    const amount = parseBRL(draft);
    if (amount === null) { setError('Valor inválido. Ex.: 2.400,00'); return; }
    if (amount === Number(value ?? 0)) { setEditing(false); return; }
    setBusy(true);
    const failure = await onSave(amount);
    setBusy(false);
    if (failure) { setError(failure); return; }
    setEditing(false);
  }

  const text = size === 'sm' ? 'text-xs' : 'text-sm';
  if (!editing) {
    const empty = !Number(value ?? 0);
    return <button type="button" onClick={start} title="Editar valor" aria-label={`${label}: ${formatBRL(value)}. Editar`} className={`group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 -mx-1.5 font-bold transition hover:bg-[#E8F4F2] ${text} ${empty ? 'text-slate-400' : 'text-[#004751]'}`}>
      {empty ? 'Definir valor' : formatBRL(value)}
      <PenLine size={12} className="opacity-50 transition group-hover:opacity-100" />
    </button>;
  }

  return <div>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="flex items-center gap-1">
      <span className={`font-semibold text-slate-500 ${text}`}>R$</span>
      <input
        ref={input}
        value={draft}
        onChange={event => { setDraft(event.target.value); setError(''); }}
        onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-label={label}
        className={`min-w-0 flex-1 rounded-lg border border-[#A7A8D0] bg-white px-2 py-1.5 font-semibold text-slate-800 outline-none focus:border-[#004751] ${text}`}
      />
      <button type="submit" disabled={busy} aria-label="Salvar valor" className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
    </form>
    {error && <p role="alert" className="mt-1 text-[10px] text-rose-600">{error}</p>}
  </div>;
}

/** Título da oportunidade com edição no lugar (ex.: "Consórcio imóvel · Pro"). */
export function TitleEditor({ value, onSave }: { value: string; onSave: (title: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);

  async function save() {
    const title = draft.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title) { setError('Escreva um título.'); return; }
    if (title === value) { setEditing(false); return; }
    setBusy(true);
    const failure = await onSave(title);
    setBusy(false);
    if (failure) { setError(failure); return; }
    setEditing(false);
  }

  if (!editing) {
    return <button type="button" onClick={() => { setDraft(value); setError(''); setEditing(true); }} title="Editar título" className="group flex w-full items-start gap-1.5 text-left text-xs font-semibold text-slate-700">
      <span className="min-w-0 flex-1 break-words">{value}</span>
      <PenLine size={11} className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-60 group-focus-visible:opacity-60" />
    </button>;
  }
  return <div>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="flex items-center gap-1">
      <input ref={input} value={draft} maxLength={120} onChange={event => { setDraft(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} aria-label="Título da oportunidade" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-[#A7A8D0] bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#004751]" />
      <button type="submit" disabled={busy} aria-label="Salvar título" className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}</button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
    </form>
    {error && <p role="alert" className="mt-1 text-[10px] text-rose-600">{error}</p>}
  </div>;
}
