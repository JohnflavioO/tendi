'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Gift, History, Layers, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  COMPLIMENTARY_REASON_MAX, complimentaryLabel, hasComplimentary, isChargingSubscription, isComplimentaryActive,
  isComplimentaryExpired, type PlanChangeAction,
} from '@/lib/complimentary';

export type PlanControlsOrganization = {
  id: string;
  name: string;
  plan_code: string | null;
  complimentary_since: string | null;
  complimentary_until: string | null;
  complimentary_reason: string | null;
  complimentary_by: string | null;
};
type Plan = { code: string; name: string };
type Change = {
  id: string; action: PlanChangeAction; from_plan_code: string | null; to_plan_code: string | null;
  complimentary_until: string | null; reason: string | null; actor_user_id: string | null; created_at: string;
};
type Notice = { ok: boolean; text: string };

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
/** "AAAA-MM-DD" no horário de Brasília. */
const brDate = (date: Date) => new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const ACTION_TEXT: Record<PlanChangeAction, string> = {
  plan_changed: 'Plano trocado',
  complimentary_granted: 'Cortesia liberada',
  complimentary_updated: 'Cortesia alterada',
  complimentary_revoked: 'Cortesia revogada',
};

/**
 * Plano e conta cortesia de uma empresa, no Console Super Admin.
 * Trocar o plano e liberar/revogar cortesia passam pelo servidor (rota de admin com chave de serviço),
 * sempre com confirmação e registro no histórico.
 */
export function PlanControls({ organization, plans, onChanged }: {
  organization: PlanControlsOrganization;
  plans: Plan[];
  onChanged: (notice: Notice) => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const [subscription, setSubscription] = useState<{ status: string; plan_code: string | null } | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [historyReady, setHistoryReady] = useState(false);
  const [planCode, setPlanCode] = useState(organization.plan_code ?? '');
  const [dialog, setDialog] = useState<null | 'plan' | 'grant' | 'revoke'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadExtras = useCallback(async () => {
    const [subRes, historyRes] = await Promise.all([
      supabase.from('billing_subscriptions').select('status,plan_code').eq('organization_id', organization.id).maybeSingle(),
      supabase.from('organization_plan_changes').select('id,action,from_plan_code,to_plan_code,complimentary_until,reason,actor_user_id,created_at')
        .eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(10),
    ]);
    setSubscription((subRes.data ?? null) as { status: string; plan_code: string | null } | null);
    const rows = (historyRes.error ? [] : historyRes.data ?? []) as Change[];
    setHistory(rows);
    const ids = [...new Set([...rows.map(row => row.actor_user_id), organization.complimentary_by].filter((id): id is string => Boolean(id)))];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id,full_name,email').in('id', ids);
      setNames(Object.fromEntries(((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(p => [p.id, p.full_name || p.email || 'Super Admin'])));
    }
    setHistoryReady(true);
  }, [organization.complimentary_by, organization.id, supabase]);

  useEffect(() => { void loadExtras(); }, [loadExtras]);
  useEffect(() => { setPlanCode(organization.plan_code ?? ''); }, [organization.plan_code]);

  const planName = (code: string | null) => plans.find(plan => plan.code === code)?.name ?? code ?? 'Sem plano';
  const charging = isChargingSubscription(subscription?.status);
  const active = isComplimentaryActive(organization);
  const expired = isComplimentaryExpired(organization);

  async function send(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/organizations/${organization.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) { setError(typeof payload.error === 'string' ? payload.error : 'Não foi possível concluir. Tente de novo.'); return false; }
    setDialog(null);
    const warning = payload.subscriptionWillOverride ? ' Atenção: a empresa paga pela Pagar.me no plano antigo; na próxima cobrança o plano volta para o da assinatura.' : '';
    await onChanged({ ok: true, text: success + warning });
    await loadExtras();
    return true;
  }

  const close = () => { if (!busy) { setDialog(null); setError(''); } };

  return (
    <section className="td-card overflow-hidden">
      <div className="grid lg:grid-cols-2">
        {/* Plano */}
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="td-icon td-icon-teal"><Layers size={19} /></span>
            <div className="min-w-0">
              <h2 className="td-title text-base">Plano</h2>
              <p className="mt-1 text-sm text-slate-500">Troque entre Start e Pro na hora, sem cobrança. A troca fica registrada no histórico.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-[200px] flex-1"><span className="td-label">Plano da empresa</span>
              <select value={planCode} onChange={event => setPlanCode(event.target.value)} className="td-input">
                {!planCode && <option value="">Sem plano</option>}
                {plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={!planCode || planCode === (organization.plan_code ?? '')} onClick={() => { setError(''); setDialog('plan'); }} className="td-btn td-btn-secondary">Trocar plano</button>
          </div>
          {charging && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Esta empresa paga pela Pagar.me ({planName(subscription?.plan_code ?? null)}). Uma troca aqui não muda a cobrança, e a próxima cobrança traz o plano da assinatura de volta.</p>}
        </div>

        {/* Cortesia */}
        <div className={`border-t border-tendi-line/70 p-5 sm:p-6 lg:border-l lg:border-t-0 ${active ? 'bg-gradient-to-br from-[#FDF4FB] to-white' : ''}`}>
          <div className="flex items-start gap-3">
            <span className="td-icon td-icon-magenta"><Gift size={19} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="td-title text-base">Conta cortesia</h2>
                {active && <span className="td-badge td-badge-magenta">{complimentaryLabel(organization)}</span>}
                {expired && <span className="td-badge td-badge-danger">Vencida</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {active ? 'Liberada sem pagamento: não cai em teste encerrado nem em pagamento pendente, e não entra na receita.'
                  : expired ? `A cortesia terminou em ${day(organization.complimentary_until!)}. A empresa está sem acesso até assinar ou ganhar outra cortesia.`
                    : 'Para parceiros e permutas: libera a empresa sem pagamento, com o plano que você escolher e prazo opcional.'}
              </p>
            </div>
          </div>

          {hasComplimentary(organization) && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="td-subtle p-3"><dt className="td-eyebrow">Plano</dt><dd className="mt-1 font-semibold text-tendi-navy">{planName(organization.plan_code)}</dd></div>
              <div className="td-subtle p-3"><dt className="td-eyebrow">Prazo</dt><dd className="mt-1 font-semibold text-tendi-navy">{organization.complimentary_until ? `até ${day(organization.complimentary_until)}` : 'Sem prazo'}</dd></div>
              <div className="td-subtle col-span-2 p-3"><dt className="td-eyebrow">Motivo</dt><dd className="mt-1 text-slate-700">{organization.complimentary_reason || '—'}</dd>
                {organization.complimentary_since && <dd className="mt-1 text-[11px] text-slate-400">Liberada em {day(organization.complimentary_since)}{organization.complimentary_by && names[organization.complimentary_by] ? ` por ${names[organization.complimentary_by]}` : ''}</dd>}
              </div>
            </dl>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {active ? <>
              <button type="button" onClick={() => { setError(''); setDialog('grant'); }} className="td-btn td-btn-secondary">Alterar cortesia</button>
              <button type="button" onClick={() => { setError(''); setDialog('revoke'); }} className="td-btn td-btn-danger">Revogar cortesia</button>
            </> : <>
              <button type="button" disabled={charging} onClick={() => { setError(''); setDialog('grant'); }} className="td-btn td-btn-accent"><Gift size={15} />{expired ? 'Liberar de novo' : 'Liberar cortesia'}</button>
              {expired && <button type="button" onClick={() => { setError(''); setDialog('revoke'); }} className="td-btn td-btn-ghost">Remover cortesia</button>}
            </>}
          </div>
          {charging && !active && <p className="mt-3 text-xs leading-5 text-slate-500">Para liberar a cortesia, a assinatura da Pagar.me precisa ser cancelada antes, para a empresa não ser cobrada.</p>}
        </div>
      </div>

      {/* Histórico */}
      <div className="border-t border-tendi-line/70 px-5 py-4 sm:px-6">
        <p className="td-eyebrow flex items-center gap-1.5"><History size={12} />Histórico de plano</p>
        {history.length ? (
          <ul className="mt-2 divide-y divide-tendi-line/70">
            {history.map(item => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-xs">
                <span className="text-slate-700">
                  <strong className="font-semibold text-tendi-navy">{ACTION_TEXT[item.action] ?? item.action}</strong>
                  {item.action === 'plan_changed' && <> · {planName(item.from_plan_code)} <ArrowRight size={11} className="inline" /> {planName(item.to_plan_code)}</>}
                  {(item.action === 'complimentary_granted' || item.action === 'complimentary_updated') && <> · {planName(item.to_plan_code)} · {item.complimentary_until ? `até ${day(item.complimentary_until)}` : 'sem prazo'}{item.reason ? ` · ${item.reason}` : ''}</>}
                </span>
                <span className="text-slate-400">{dateTime(item.created_at)}{item.actor_user_id ? ` · ${names[item.actor_user_id] ?? 'Super Admin'}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-slate-400">{historyReady ? 'Nenhuma troca de plano ou cortesia registrada ainda.' : 'Carregando…'}</p>}
      </div>

      {dialog === 'plan' && (
        <Dialog title="Trocar o plano?" onClose={close}>
          <p className="text-sm text-slate-600"><strong>{organization.name}</strong> passa de <strong>{planName(organization.plan_code)}</strong> para <strong>{planName(planCode)}</strong> agora. Não gera cobrança e fica registrado no histórico com o seu nome.</p>
          {charging && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">A empresa paga pela Pagar.me no plano {planName(subscription?.plan_code ?? null)}. A próxima cobrança traz esse plano de volta.</p>}
          <DialogFooter error={error} busy={busy} onCancel={close} confirm="Trocar plano" onConfirm={() => void send({ action: 'set_plan', planCode }, `Plano trocado para ${planName(planCode)}.`)} />
        </Dialog>
      )}

      {dialog === 'grant' && (
        <GrantDialog
          organization={organization}
          plans={plans}
          editing={active}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={value => void send({ action: 'grant_complimentary', ...value }, active ? 'Cortesia alterada.' : 'Cortesia liberada. A empresa já usa o TendiDesk sem pagamento.')}
        />
      )}

      {dialog === 'revoke' && (
        <Dialog title={active ? 'Revogar a cortesia?' : 'Remover a cortesia?'} onClose={close}>
          <p className="text-sm text-slate-600">{organization.name} volta ao fluxo normal de assinatura.</p>
          <p className="mt-3 rounded-xl bg-tendi-haze p-3 text-xs leading-5 text-slate-600">{charging ? 'Ela tem assinatura na Pagar.me, então continua ativa e paga normalmente.' : 'Sem assinatura, ela passa a ver a tela "Escolha um plano para continuar" (ou segue no teste grátis, se ainda houver dias). Os dados continuam guardados.'}</p>
          <DialogFooter error={error} busy={busy} onCancel={close} confirm={active ? 'Revogar cortesia' : 'Remover cortesia'} danger onConfirm={() => void send({ action: 'revoke_complimentary' }, 'Cortesia revogada.')} />
        </Dialog>
      )}
    </section>
  );
}

function GrantDialog({ organization, plans, editing, busy, error, onCancel, onConfirm }: {
  organization: PlanControlsOrganization;
  plans: Plan[];
  editing: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (value: { planCode: string; until: string; reason: string }) => void;
}) {
  const today = brDate(new Date());
  const [planCode, setPlanCode] = useState(organization.plan_code ?? plans[plans.length - 1]?.code ?? '');
  const [withDeadline, setWithDeadline] = useState(Boolean(editing && organization.complimentary_until));
  const [until, setUntil] = useState(editing && organization.complimentary_until ? brDate(new Date(organization.complimentary_until)) : brDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)));
  const [reason, setReason] = useState(editing ? organization.complimentary_reason ?? '' : '');
  const valid = Boolean(planCode) && reason.trim().length >= 3 && (!withDeadline || until >= today);

  return (
    <Dialog title={editing ? 'Alterar a cortesia' : 'Liberar conta cortesia'} onClose={onCancel}>
      <p className="text-sm text-slate-600"><strong>{organization.name}</strong> usa o TendiDesk sem pagamento, sem teste encerrado e sem cobrança.</p>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); if (valid) onConfirm({ planCode, until: withDeadline ? until : '', reason }); }}>
        <label className="block"><span className="td-label">Plano liberado</span>
          <select value={planCode} onChange={event => setPlanCode(event.target.value)} className="td-input">
            {plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="td-label">Prazo</legend>
          <div className="td-tabs">
            <button type="button" onClick={() => setWithDeadline(false)} className={`td-tab ${!withDeadline ? 'td-tab-active' : ''}`}>Sem prazo</button>
            <button type="button" onClick={() => setWithDeadline(true)} className={`td-tab ${withDeadline ? 'td-tab-active' : ''}`}><CalendarClock size={13} />Até uma data</button>
          </div>
          {withDeadline
            ? <input type="date" min={today} value={until} onChange={event => setUntil(event.target.value)} aria-label="Data de fim da cortesia" className="td-input mt-2" />
            : <p className="mt-2 text-xs text-slate-500">Vale até você revogar.</p>}
          {withDeadline && <p className="mt-1.5 text-xs text-slate-500">No fim do dia escolhido, a empresa precisa assinar para continuar.</p>}
        </fieldset>
        <label className="block"><span className="td-label">Motivo</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={COMPLIMENTARY_REASON_MAX} rows={2} placeholder="Ex.: parceiro de implantação, permuta com agência" className="td-input" />
        </label>
        <DialogFooter error={error} busy={busy} onCancel={onCancel} confirm={editing ? 'Salvar alterações' : 'Liberar cortesia'} disabled={!valid} submit />
      </form>
    </Dialog>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-tendi-night/50 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()} className="animate-pop w-full max-w-md rounded-2xl border border-tendi-line bg-white p-6 shadow-pop shadow-slate-900/20">
        <div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight text-tendi-navy">{title}</h2><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function DialogFooter({ error, busy, onCancel, onConfirm, confirm, danger = false, disabled = false, submit = false }: {
  error: string; busy: boolean; onCancel: () => void; onConfirm?: () => void; confirm: string; danger?: boolean; disabled?: boolean; submit?: boolean;
}) {
  return <>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={onCancel} disabled={busy} className="td-btn td-btn-ghost">Cancelar</button>
      <button type={submit ? 'submit' : 'button'} onClick={submit ? undefined : onConfirm} disabled={busy || disabled} className={`td-btn ${danger ? 'bg-rose-700 text-white hover:bg-rose-800' : 'td-btn-primary'} disabled:opacity-50`}>{busy && <Loader2 size={15} className="animate-spin" />}{confirm}</button>
    </div>
  </>;
}
