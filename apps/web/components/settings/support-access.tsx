'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, LifeBuoy, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import {
  SUPPORT_GRANT_COLUMNS, SUPPORT_HOUR_OPTIONS, SUPPORT_STATE_LABEL, formatSupportCode, hoursLabel, supportGrantState,
  type SupportGrant,
} from '@/lib/support-access';

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Configurações > Acesso do suporte Tendi.
 * O dono ou administrador gera um código, passa para o suporte e pode encerrar o acesso quando quiser.
 * Sem esse código, a equipe da Tendi não vê conversas, contatos, CRM nem agenda da empresa.
 */
export function SupportAccessCard({ organizationId }: { organizationId: string }) {
  const supabase = useMemo(() => createClient() as any, []);
  const { role, supportUntil } = useWorkspaceRole(organizationId);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [available, setAvailable] = useState(true);
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState('');
  const [generated, setGenerated] = useState<{ code: string; expiresAt: string; hours: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('support_access_grants').select(SUPPORT_GRANT_COLUMNS)
      .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(6);
    if (queryError) { setAvailable(false); return; }
    setAvailable(true);
    setGrants((data ?? []) as SupportGrant[]);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()); void load(); }, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  // Quem está aqui com acesso de suporte não gera nem prorroga o próprio acesso.
  const canManage = (role === 'owner' || role === 'admin') && !supportUntil;
  const active = grants.find(grant => supportGrantState(grant, now) === 'active');
  const waiting = grants.find(grant => supportGrantState(grant, now) === 'waiting');
  const codeStillValid = generated && Date.parse(generated.expiresAt) > now.getTime() && waiting;

  async function generate() {
    setBusy('generate');
    setError('');
    setCopied(false);
    const { data, error: rpcError } = await supabase.rpc('create_support_code', { p_organization_id: organizationId, p_access_hours: hours, p_reason: reason.trim() || null });
    setBusy('');
    const row = Array.isArray(data) ? data[0] : data;
    if (rpcError || !row?.code) { setError(rpcError?.message ?? 'Não foi possível gerar o código.'); return; }
    setGenerated({ code: String(row.code), expiresAt: row.code_expires_at, hours: row.access_hours });
    setReason('');
    await load();
  }

  async function end() {
    setBusy('end');
    setError('');
    const { error: rpcError } = await supabase.rpc('end_support_access', { p_organization_id: organizationId });
    setBusy('');
    if (rpcError) { setError(rpcError.message); return; }
    setGenerated(null);
    await load();
  }

  async function copy() {
    if (!generated) return;
    try { await navigator.clipboard.writeText(generated.code); setCopied(true); } catch { setCopied(false); }
  }

  if (!available || role === undefined) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-[#FDF0FA] p-3 text-[#CB0A9F]"><LifeBuoy size={20} /></span>
        <div>
          <h2 className="text-sm font-bold text-[#2F316B]">Acesso do suporte Tendi</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">A equipe da Tendi não vê suas conversas, contatos, CRM nem agenda. Se você precisar de ajuda dentro da sua conta, gere um código e passe para o suporte: ele libera o acesso por tempo limitado, e você pode encerrar quando quiser.</p>
        </div>
      </div>

      {active && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CB0A9F]/30 bg-[#FDF0FA] px-4 py-3">
          <p className="text-sm text-[#7A0760]"><strong>O suporte está com acesso à sua conta</strong> até {active.access_expires_at ? dateTime(active.access_expires_at) : '—'}.</p>
          {canManage && <button type="button" onClick={() => void end()} disabled={busy === 'end'} className="flex items-center gap-2 rounded-xl bg-[#CB0A9F] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#A8087F] disabled:opacity-50">{busy === 'end' && <Loader2 size={14} className="animate-spin" />}Encerrar acesso agora</button>}
        </div>
      )}

      {codeStillValid && generated && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="text-xs font-semibold text-emerald-900">Passe este código para o suporte da Tendi</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-3xl font-bold tracking-[.18em] text-emerald-900" aria-label={`Código ${generated.code.split('').join(' ')}`}>{formatSupportCode(generated.code)}</span>
            <button type="button" onClick={() => void copy()} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          <p className="mt-2 text-xs text-emerald-800">Vale até {dateTime(generated.expiresAt)} e libera {hoursLabel(generated.hours)} de acesso. O código aparece só agora: se sair desta tela, gere outro.</p>
        </div>
      )}
      {waiting && !codeStillValid && !active && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">Há um código aguardando o suporte, válido até {dateTime(waiting.code_expires_at)}. Se você não o tem mais, gere um novo; o anterior deixa de valer.</p>
      )}

      {canManage && !active && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[170px_1fr_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Liberar por</span>
            <select value={hours} onChange={event => setHours(Number(event.target.value))} disabled={busy === 'generate'} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0]">
              {SUPPORT_HOUR_OPTIONS.map(option => <option key={option} value={option}>{hoursLabel(option)}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Motivo (opcional)</span>
            <input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} disabled={busy === 'generate'} placeholder="Ex.: ajuda para configurar a agenda" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0]" />
          </label>
          <button type="button" onClick={() => void generate()} disabled={busy === 'generate'} className="flex items-center justify-center gap-2 rounded-xl bg-[#2F316B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#25275B] disabled:opacity-50">{busy === 'generate' && <Loader2 size={15} className="animate-spin" />}{waiting ? 'Gerar novo código' : 'Gerar código de suporte'}</button>
        </div>
      )}
      {!canManage && !supportUntil && <p className="mt-4 text-xs text-slate-400">Somente o dono ou um administrador da empresa pode liberar ou encerrar o acesso do suporte.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {grants.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Últimos acessos</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {grants.map(grant => {
              const state = supportGrantState(grant, now);
              return (
                <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <span className="text-slate-600">{dateTime(grant.created_at)} · {hoursLabel(grant.access_hours)}{grant.reason ? ` · ${grant.reason}` : ''}</span>
                  <span className={state === 'active' ? 'font-semibold text-[#CB0A9F]' : state === 'waiting' ? 'font-semibold text-amber-700' : 'text-slate-400'}>{SUPPORT_STATE_LABEL[state]}{state === 'finished' && grant.redeemed_at ? ` · usado em ${dateTime(grant.redeemed_at)}` : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
