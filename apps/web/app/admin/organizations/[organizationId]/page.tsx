'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Ban, LifeBuoy, Loader2, MessageCircle, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import { ROLE_INFO, isRole } from '@/lib/team';
import { ORGANIZATION_STATUS_LABEL, confirmsDeletion, isInternalOrganization } from '@/lib/company-control';
import { SUPPORT_GRANT_COLUMNS, SUPPORT_STATE_LABEL, cleanSupportCode, formatSupportCode, hoursLabel, supportGrantState, type SupportGrant } from '@/lib/support-access';

type Organization = { id: string; name: string; slug: string; status: string; plan_code: string | null; created_at: string; trial_ends_at: string | null };
type Plan = { code: string; name: string };
type Member = { user_id: string; role: string; status: string; name: string; email: string };
type Grant = SupportGrant & { redeemed_by: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0] disabled:bg-slate-50';
const primary = 'flex items-center justify-center gap-2 rounded-xl bg-[#1D1F4E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2F316B] disabled:opacity-40';
const secondary = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40';

/**
 * Ficha da empresa no Console: situação, plano, equipe, conexões, acesso de suporte e exclusão.
 * O Console administra a conta; conversas, contatos, CRM e agenda só abrem com um código de
 * suporte gerado pelo próprio cliente.
 */
export default function OrganizationAdminPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient() as any, []);
  const organizationId = params.organizationId;
  const [userId, setUserId] = useState('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/login'); return; }
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (!admin) { router.replace('/inbox'); return; }
    setUserId(auth.user.id);

    const [orgRes, planRes, memberRes, channelRes, agentRes, grantRes] = await Promise.all([
      supabase.from('organizations').select('id,name,slug,status,plan_code,created_at,trial_ends_at').eq('id', organizationId).maybeSingle(),
      supabase.from('subscription_plans').select('code,name').order('display_order'),
      supabase.from('organization_memberships').select('user_id,role,status').eq('organization_id', organizationId),
      supabase.from('channel_connections').select('status').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
      supabase.from('ai_agents').select('is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('support_access_grants').select(`${SUPPORT_GRANT_COLUMNS},redeemed_by`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(8),
    ]);
    if (!orgRes.data) { setOrganization(null); setLoading(false); return; }
    const org = orgRes.data as Organization;
    setOrganization(org);
    setPlanCode(org.plan_code ?? '');
    setPlans((planRes.data ?? []) as Plan[]);
    setWhatsapp((channelRes.data as { status?: string } | null)?.status ?? null);
    setAiEnabled(Boolean((agentRes.data as { is_enabled?: boolean } | null)?.is_enabled));
    setGrants(grantRes.error ? [] : ((grantRes.data ?? []) as Grant[]));

    const rows = (memberRes.data ?? []) as Array<{ user_id: string; role: string; status: string }>;
    const ids = rows.map(row => row.user_id);
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] };
    const byId = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(profile => [profile.id, profile]));
    setMembers(rows.map(row => ({ ...row, name: byId.get(row.user_id)?.full_name || '—', email: byId.get(row.user_id)?.email || '—' })));
    setLoading(false);
  }, [organizationId, router, supabase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const internal = isInternalOrganization(organization);
  const mySession = grants.find(grant => grant.redeemed_by === userId && supportGrantState(grant, now) === 'active');
  const waiting = grants.find(grant => supportGrantState(grant, now) === 'waiting');
  const status = organization ? (ORGANIZATION_STATUS_LABEL[organization.status] ?? { label: organization.status, tone: 'bg-slate-100 text-slate-600 ring-slate-200' }) : null;

  async function call(key: string, method: 'PATCH' | 'DELETE', body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(key);
    setMessage(null);
    const response = await fetch(`/api/admin/organizations/${organizationId}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy('');
    if (!response?.ok) { setMessage({ ok: false, text: typeof payload.error === 'string' ? payload.error : 'Não foi possível concluir.' }); return false; }
    setMessage({ ok: true, text: success });
    return true;
  }

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    setBusy('redeem');
    setMessage(null);
    const { data, error } = await supabase.rpc('redeem_support_code', { p_code: code });
    setBusy('');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.organization_id) { setMessage({ ok: false, text: error?.message ?? 'Código inválido ou vencido.' }); return; }
    setCode('');
    // O código pertence a uma empresa específica: se for de outra, leva para a ficha certa.
    if (row.organization_id !== organizationId) { router.push(`/admin/organizations/${row.organization_id}`); return; }
    setMessage({ ok: true, text: `Acesso liberado até ${dateTime(row.access_expires_at)}.` });
    await load();
  }

  async function endSupport() {
    setBusy('end');
    setMessage(null);
    const { error } = await supabase.rpc('end_support_access', { p_organization_id: organizationId });
    setBusy('');
    if (error) { setMessage({ ok: false, text: error.message }); return; }
    setMessage({ ok: true, text: 'Acesso de suporte encerrado.' });
    await load();
  }

  if (loading) return <AdminShell title="Empresa"><p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando…</p></AdminShell>;
  if (!organization) return <AdminShell title="Empresa"><div className={card}><p className="text-sm text-slate-600">Empresa não encontrada. Ela pode ter sido excluída.</p><a href="/admin" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#004751] hover:underline"><ArrowLeft size={14} />Voltar para a visão geral</a></div></AdminShell>;

  return (
    <AdminShell title={organization.name}>
      <div className="space-y-5">
        <a href="/admin" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#004751]"><ArrowLeft size={13} />Visão geral</a>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#CB0A9F]">{internal ? 'Workspace interno' : 'Cliente'}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#25275B]">{organization.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${status.tone}`}>{status.label}</span>}
              <span>Plano {plans.find(plan => plan.code === organization.plan_code)?.name ?? '—'}</span>
              <span>· cliente desde {day(organization.created_at)}</span>
              {organization.status === 'trial' && organization.trial_ends_at && <span>· teste até {day(organization.trial_ends_at)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/admin/organizations/${organization.id}/setup`} className={secondary}><UserPlus size={15} />Convidar responsável</a>
            {internal && <a href={`/inbox?organization=${organization.id}`} className={primary}>Abrir o workspace<ArrowRight size={15} /></a>}
          </div>
        </header>

        {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

        {!internal && (
          <section className={`${card} border-[#CB0A9F]/25`}>
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-[#FDF0FA] p-3 text-[#CB0A9F]"><LifeBuoy size={20} /></span>
              <div>
                <h2 className="text-base font-bold text-[#25275B]">Acesso de suporte</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">Conversas, contatos, CRM e agenda deste cliente são confidenciais. Para entrar na conta dele, peça que gere um código em Configurações → Acesso do suporte Tendi e informe abaixo.</p>
              </div>
            </div>

            {mySession ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FDF0FA] px-4 py-3">
                <p className="text-sm text-[#7A0760]"><strong>Acesso liberado pelo cliente</strong> até {mySession.access_expires_at ? dateTime(mySession.access_expires_at) : '—'}{mySession.reason ? ` · ${mySession.reason}` : ''}.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void endSupport()} disabled={busy === 'end'} className={secondary}>{busy === 'end' && <Loader2 size={14} className="animate-spin" />}Encerrar acesso</button>
                  <a href={`/inbox?organization=${organization.id}`} className={primary}>Entrar no workspace<ArrowRight size={15} /></a>
                </div>
              </div>
            ) : (
              <form onSubmit={redeem} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Código de suporte (8 dígitos)</span>
                  <input value={formatSupportCode(code)} onChange={event => setCode(cleanSupportCode(event.target.value))} inputMode="numeric" autoComplete="off" placeholder="0000 0000" aria-label="Código de suporte" className={`${field} w-48 font-mono text-lg tracking-[.15em]`} />
                </label>
                <button disabled={code.length !== 8 || busy === 'redeem'} className={primary}>{busy === 'redeem' && <Loader2 size={15} className="animate-spin" />}Liberar acesso</button>
                {waiting && <p className="text-xs text-amber-700">O cliente gerou um código às {dateTime(waiting.created_at)} (vale até {dateTime(waiting.code_expires_at)}).</p>}
              </form>
            )}

            {grants.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Histórico</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {grants.map(grant => {
                    const state = supportGrantState(grant, now);
                    return <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="text-slate-600">{dateTime(grant.created_at)} · {hoursLabel(grant.access_hours)}{grant.reason ? ` · ${grant.reason}` : ''}</span><span className={state === 'active' ? 'font-semibold text-[#CB0A9F]' : state === 'waiting' ? 'font-semibold text-amber-700' : 'text-slate-400'}>{SUPPORT_STATE_LABEL[state]}</span></li>;
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold text-[#25275B]"><ShieldCheck size={17} className="text-[#004751]" />Conta</h2>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[200px] flex-1"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Plano</span>
                <select value={planCode} onChange={event => setPlanCode(event.target.value)} disabled={busy === 'plan'} className={field}>
                  {!planCode && <option value="">Sem plano</option>}
                  {plans.map(plan => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                </select>
              </label>
              <button type="button" disabled={!planCode || planCode === (organization.plan_code ?? '') || busy === 'plan'} onClick={async () => { if (await call('plan', 'PATCH', { action: 'set_plan', planCode }, 'Plano atualizado.')) await load(); }} className={secondary}>{busy === 'plan' && <Loader2 size={14} className="animate-spin" />}Salvar plano</button>
            </div>
            {!internal && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                {organization.status === 'suspended' ? <>
                  <p className="text-sm text-slate-600">A empresa está <strong>bloqueada</strong>: ninguém da equipe dela entra no Tendi. Os dados continuam guardados.</p>
                  <button type="button" disabled={busy === 'status'} onClick={async () => { if (await call('status', 'PATCH', { action: 'reactivate' }, 'Empresa reativada.')) await load(); }} className={`${primary} mt-3`}>{busy === 'status' && <Loader2 size={14} className="animate-spin" />}Reativar empresa</button>
                </> : <>
                  <p className="text-sm text-slate-600">Bloquear impede o acesso de toda a equipe da empresa e pausa a IA e os lembretes automáticos. Nada é apagado, e você pode reativar depois.</p>
                  <button type="button" disabled={busy === 'status'} onClick={async () => { if (window.confirm(`Bloquear o acesso de ${organization.name}?`) && await call('status', 'PATCH', { action: 'suspend' }, 'Empresa bloqueada.')) await load(); }} className={`${secondary} mt-3 text-rose-700`}>{busy === 'status' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}Bloquear empresa</button>
                </>}
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 text-base font-bold text-[#25275B]"><MessageCircle size={17} className="text-[#004751]" />Conexões</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="text-slate-500">WhatsApp</dt><dd className={whatsapp === 'connected' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>{whatsapp === 'connected' ? 'Conectado' : whatsapp === 'pending' ? 'Aguardando QR Code' : whatsapp ? 'Desconectado' : 'Não configurado'}</dd></div>
              <div className="flex items-center justify-between"><dt className="flex items-center gap-1.5 text-slate-500"><Sparkles size={14} />Agente de IA</dt><dd className={aiEnabled ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>{aiEnabled ? 'Liberado' : 'Não liberado'}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/chatbots?organization=${organization.id}`} className={secondary}>Conexão do WhatsApp</a>
              <a href="/admin/ia" className={secondary}>Agentes de IA</a>
            </div>
          </section>
        </div>

        <section className={card}>
          <h2 className="flex items-center gap-2 text-base font-bold text-[#25275B]"><Users size={17} className="text-[#004751]" />Equipe ({members.length})</h2>
          {members.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {members.map(member => (
                <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold text-[#25275B]">{member.name}</span><span className="block truncate text-xs text-slate-400">{member.email}</span></span>
                  <span className="text-xs text-slate-500">{isRole(member.role) ? ROLE_INFO[member.role].label : member.role}{member.status !== 'active' ? ` · ${member.status === 'invited' ? 'convite pendente' : member.status}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">Ninguém vinculado ainda. Convide o responsável pela empresa para ela começar a usar.</p>}
          <a href={`/equipe?organization=${organization.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#004751] hover:underline">Gerenciar equipe<ArrowRight size={13} /></a>
        </section>

        {!internal && (
          <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-bold text-rose-800"><Trash2 size={17} />Excluir empresa</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Apaga a empresa e <strong>todos os dados dela</strong>: conversas, contatos, CRM, agenda, equipe e arquivos. Desconecta o WhatsApp. Não tem como desfazer. As contas de login das pessoas não são apagadas. Para só impedir o acesso, use Bloquear.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[240px] flex-1"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Digite <strong>{organization.name}</strong> para confirmar</span>
                <input value={confirmName} onChange={event => setConfirmName(event.target.value)} autoComplete="off" disabled={busy === 'delete'} className={field} />
              </label>
              <button type="button" disabled={!confirmsDeletion(confirmName, organization.name) || busy === 'delete'} onClick={async () => { if (await call('delete', 'DELETE', { confirmName }, 'Empresa excluída.')) router.replace('/admin'); }} className="flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-40">{busy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Excluir definitivamente</button>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
