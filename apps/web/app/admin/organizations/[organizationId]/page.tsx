'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Ban, BadgeCheck, Copy, LifeBuoy, Loader2, MessageCircle, ShieldCheck, Bot, Trash2, UserPlus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AdminShell } from '@/components/admin/admin-shell';
import { ROLE_INFO, isRole } from '@/lib/team';
import { ORGANIZATION_STATUS_LABEL, confirmsDeletion, isInternalOrganization } from '@/lib/company-control';
import { PlanControls } from '@/components/admin/plan-controls';
import { COMPLIMENTARY_COLUMNS, complimentaryLabel, isComplimentaryActive } from '@/lib/complimentary';
import { isOfficial, sessionIdFor } from '@/lib/whatsapp-session';
import { SUPPORT_GRANT_COLUMNS, SUPPORT_STATE_LABEL, cleanSupportCode, formatSupportCode, hoursLabel, supportGrantState, type SupportGrant } from '@/lib/support-access';

type Organization = {
  id: string; name: string; slug: string; status: string; plan_code: string | null; created_at: string; trial_ends_at: string | null;
  complimentary_since: string | null; complimentary_until: string | null; complimentary_reason: string | null; complimentary_by: string | null;
};
type Plan = { code: string; name: string };
type Member = { user_id: string; role: string; status: string; name: string; email: string };
type Grant = SupportGrant & { redeemed_by: string | null };
type WhatsappRow = { status: string; settings: Record<string, unknown> | null; provider_account_id: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const card = 'td-card p-5';
const field = 'td-input';
const primary = 'td-btn td-btn-primary';
const secondary = 'td-btn td-btn-secondary';

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
  const [whatsappRow, setWhatsappRow] = useState<WhatsappRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/login'); return; }
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (!admin) { router.replace('/inbox'); return; }
    setUserId(auth.user.id);

    const [orgRes, planRes, memberRes, channelRes, agentRes, grantRes] = await Promise.all([
      supabase.from('organizations').select(`id,name,slug,status,plan_code,created_at,trial_ends_at,${COMPLIMENTARY_COLUMNS}`).eq('id', organizationId).maybeSingle(),
      supabase.from('subscription_plans').select('code,name').order('display_order'),
      supabase.from('organization_memberships').select('user_id,role,status').eq('organization_id', organizationId),
      supabase.from('channel_connections').select('status,settings,provider_account_id').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
      supabase.from('ai_agents').select('is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('support_access_grants').select(`${SUPPORT_GRANT_COLUMNS},redeemed_by`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(8),
    ]);
    if (!orgRes.data) { setOrganization(null); setLoading(false); return; }
    const org = orgRes.data as Organization;
    setOrganization(org);
    setPlans((planRes.data ?? []) as Plan[]);
    setWhatsapp((channelRes.data as { status?: string } | null)?.status ?? null);
    setWhatsappRow((channelRes.data as WhatsappRow | null) ?? null);
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

  async function prepareOfficial() {
    if (await call('official', 'PATCH', { action: 'prepare_official_whatsapp' }, 'Sessão reservada. Agora ligue o número oficial no painel do On Connect com o código abaixo.')) await load();
  }

  async function copySession(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  if (loading) return <AdminShell title="Empresa"><p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando…</p></AdminShell>;
  if (!organization) return <AdminShell title="Empresa"><div className={card}><p className="text-sm text-slate-600">Empresa não encontrada. Ela pode ter sido excluída.</p><Link href="/admin" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-tendi-teal hover:underline"><ArrowLeft size={14} />Voltar para a visão geral</Link></div></AdminShell>;

  return (
    <AdminShell title={organization.name}>
      <div className="space-y-5">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-tendi-teal"><ArrowLeft size={13} />Visão geral</Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-tendi-magenta">{internal ? 'Workspace interno' : 'Cliente'}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-tendi-navy">{organization.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${status.tone}`}>{status.label}</span>}
              {isComplimentaryActive(organization) && <span className="td-badge td-badge-magenta">{complimentaryLabel(organization)}</span>}
              <span>Plano {plans.find(plan => plan.code === organization.plan_code)?.name ?? '—'}</span>
              <span>· cliente desde {day(organization.created_at)}</span>
              {organization.status === 'trial' && organization.trial_ends_at && <span>· teste até {day(organization.trial_ends_at)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/organizations/${organization.id}/setup`} className={secondary}><UserPlus size={15} />Convidar responsável</Link>
            {internal && <Link href={`/inbox?organization=${organization.id}`} className={primary}>Abrir o workspace<ArrowRight size={15} /></Link>}
          </div>
        </header>

        {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

        {!internal && (
          <section className={`${card} border-tendi-magenta/25`}>
            <div className="flex items-start gap-3">
              <span className="td-icon td-icon-magenta"><LifeBuoy size={20} /></span>
              <div>
                <h2 className="td-title text-base">Acesso de suporte</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">Conversas, contatos, CRM e agenda deste cliente são confidenciais. Para entrar na conta dele, peça que gere um código em Configurações → Acesso do suporte TendiDesk e informe abaixo.</p>
              </div>
            </div>

            {mySession ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FDF0FA] px-4 py-3">
                <p className="text-sm text-[#7A0760]"><strong>Acesso liberado pelo cliente</strong> até {mySession.access_expires_at ? dateTime(mySession.access_expires_at) : '—'}{mySession.reason ? ` · ${mySession.reason}` : ''}.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void endSupport()} disabled={busy === 'end'} className={secondary}>{busy === 'end' && <Loader2 size={14} className="animate-spin" />}Encerrar acesso</button>
                  <Link href={`/inbox?organization=${organization.id}`} className={primary}>Entrar no workspace<ArrowRight size={15} /></Link>
                </div>
              </div>
            ) : (
              <form onSubmit={redeem} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block"><span className="td-label">Código de suporte (8 dígitos)</span>
                  <input value={formatSupportCode(code)} onChange={event => setCode(cleanSupportCode(event.target.value))} inputMode="numeric" autoComplete="off" placeholder="0000 0000" aria-label="Código de suporte" className={`${field} w-48 font-mono text-lg tracking-[.15em]`} />
                </label>
                <button disabled={code.length !== 8 || busy === 'redeem'} className={primary}>{busy === 'redeem' && <Loader2 size={15} className="animate-spin" />}Liberar acesso</button>
                {waiting && <p className="text-xs text-amber-700">O cliente gerou um código às {dateTime(waiting.created_at)} (vale até {dateTime(waiting.code_expires_at)}).</p>}
              </form>
            )}

            {grants.length > 0 && (
              <div className="mt-5 border-t border-tendi-line/70 pt-4">
                <p className="td-eyebrow">Histórico</p>
                <ul className="mt-2 divide-y divide-tendi-line/70">
                  {grants.map(grant => {
                    const state = supportGrantState(grant, now);
                    return <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="text-slate-600">{dateTime(grant.created_at)} · {hoursLabel(grant.access_hours)}{grant.reason ? ` · ${grant.reason}` : ''}</span><span className={state === 'active' ? 'font-semibold text-tendi-magenta' : state === 'waiting' ? 'font-semibold text-amber-700' : 'text-slate-400'}>{SUPPORT_STATE_LABEL[state]}</span></li>;
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        <PlanControls organization={organization} plans={plans} onChanged={async notice => { setMessage(notice); await load(); }} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card}>
            <h2 className="flex items-center gap-2 td-title text-base"><ShieldCheck size={17} className="text-tendi-teal" />Acesso da empresa</h2>
            {internal ? <p className="mt-3 text-sm text-slate-600">O workspace interno da plataforma não pode ser bloqueado.</p> : (
              <div className="mt-3">
                {organization.status === 'suspended' ? <>
                  <p className="text-sm text-slate-600">A empresa está <strong>bloqueada</strong>: ninguém da equipe dela entra no TendiDesk. Os dados continuam guardados.</p>
                  <button type="button" disabled={busy === 'status'} onClick={async () => { if (await call('status', 'PATCH', { action: 'reactivate' }, 'Empresa reativada.')) await load(); }} className={`${primary} mt-3`}>{busy === 'status' && <Loader2 size={14} className="animate-spin" />}Reativar empresa</button>
                </> : <>
                  <p className="text-sm text-slate-600">Bloquear impede o acesso de toda a equipe da empresa e pausa a IA e os lembretes automáticos. Nada é apagado, e você pode reativar depois.</p>
                  <button type="button" disabled={busy === 'status'} onClick={async () => { if (window.confirm(`Bloquear o acesso de ${organization.name}?`) && await call('status', 'PATCH', { action: 'suspend' }, 'Empresa bloqueada.')) await load(); }} className={`${secondary} mt-3 text-rose-700`}>{busy === 'status' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}Bloquear empresa</button>
                </>}
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="flex items-center gap-2 td-title text-base"><MessageCircle size={17} className="text-tendi-teal" />Conexões</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><dt className="text-slate-500">WhatsApp</dt><dd className={whatsapp === 'connected' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>{whatsapp === 'connected' ? 'Conectado' : whatsapp === 'pending' ? (isOfficial(whatsappRow?.settings) ? 'Aguardando ativação' : 'Aguardando QR Code') : whatsapp ? 'Desconectado' : 'Não configurado'}</dd></div>
              {whatsappRow && <div className="flex items-center justify-between"><dt className="text-slate-500">Tipo de número</dt><dd className="font-semibold text-tendi-navy">{isOfficial(whatsappRow.settings) ? 'Oficial (API da Meta)' : 'QR Code'}</dd></div>}
              <div className="flex items-center justify-between"><dt className="flex items-center gap-1.5 text-slate-500"><Bot size={14} />Agente de IA</dt><dd className={aiEnabled ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>{aiEnabled ? 'Liberado' : 'Não liberado'}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/chatbots?organization=${organization.id}`} className={secondary}>Conexão do WhatsApp</Link>
              <Link href="/admin/ia" className={secondary}>Agentes de IA</Link>
            </div>

            <div className="mt-5 border-t border-tendi-line/70 pt-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-tendi-navy"><BadgeCheck size={15} className="text-tendi-teal" />Número oficial (API da Meta)</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Para este cliente usar um número da API oficial: reserve a sessão, copie o código e, no painel do On Connect, use <strong>Conexões › Nova conexão Meta › Workspace do Tendi</strong>. Se ele já usa QR Code, marque <strong>Substituir a conexão atual</strong>.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-tendi-haze px-3 py-2 font-mono text-xs text-tendi-navy">{sessionIdFor(organization.id, whatsappRow?.provider_account_id)}</code>
                <button type="button" onClick={() => void copySession(sessionIdFor(organization.id, whatsappRow?.provider_account_id))} className={secondary}><Copy size={14} />{copied ? 'Copiado' : 'Copiar código'}</button>
                {!whatsappRow && <button type="button" disabled={busy === 'official'} onClick={() => void prepareOfficial()} className={primary}>{busy === 'official' && <Loader2 size={14} className="animate-spin" />}Reservar sessão</button>}
              </div>
              {!whatsappRow && <p className="mt-2 text-[11px] text-amber-700">Reserve a sessão antes de ligar o número no On Connect: sem ela, o TendiDesk não recebe as mensagens deste workspace.</p>}
            </div>
          </section>
        </div>

        <section className={card}>
          <h2 className="flex items-center gap-2 td-title text-base"><Users size={17} className="text-tendi-teal" />Equipe ({members.length})</h2>
          {members.length ? (
            <ul className="mt-3 divide-y divide-tendi-line/70">
              {members.map(member => (
                <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold text-tendi-navy">{member.name}</span><span className="block truncate text-xs text-slate-400">{member.email}</span></span>
                  <span className="text-xs text-slate-500">{isRole(member.role) ? ROLE_INFO[member.role].label : member.role}{member.status !== 'active' ? ` · ${member.status === 'invited' ? 'convite pendente' : member.status}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">Ninguém vinculado ainda. Convide o responsável pela empresa para ela começar a usar.</p>}
          <Link href={`/equipe?organization=${organization.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-tendi-teal hover:underline">Gerenciar equipe<ArrowRight size={13} /></Link>
        </section>

        {!internal && (
          <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-bold text-rose-800"><Trash2 size={17} />Excluir empresa</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Apaga a empresa e <strong>todos os dados dela</strong>: conversas, contatos, CRM, agenda, equipe e arquivos. Desconecta o WhatsApp. Não tem como desfazer. As contas de login das pessoas não são apagadas. Para só impedir o acesso, use Bloquear.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[240px] flex-1"><span className="td-label">Digite <strong>{organization.name}</strong> para confirmar</span>
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
