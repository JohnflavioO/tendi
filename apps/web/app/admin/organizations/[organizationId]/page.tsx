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
import { isOfficial, sessionIdFor, stableSessionId } from '@/lib/whatsapp-session';
import { SUPPORT_GRANT_COLUMNS, SUPPORT_STATE_LABEL, cleanSupportCode, formatSupportCode, hoursLabel, supportGrantState, type SupportGrant } from '@/lib/support-access';

type Organization = {
  id: string; name: string; slug: string; status: string; plan_code: string | null; created_at: string; trial_ends_at: string | null;
  complimentary_since: string | null; complimentary_until: string | null; complimentary_reason: string | null; complimentary_by: string | null;
};
type Plan = { code: string; name: string };
type Member = { user_id: string; role: string; status: string; name: string; email: string };
type Grant = SupportGrant & { redeemed_by: string | null };
type BusinessOnboarding = { status:string; proposed_monthly_cents:number; setup_fee_cents:number; number_source:string; payment_verified_at:string|null;setup_payment_status?:string;setup_payment_url?:string|null;setup_payment_order_id?:string|null };
type BusinessBilling = { status:string; plan_code:string|null; last_event_type:string|null; provider_subscription_id:string|null };
const businessStages = [
 ['requested','Solicitado'],['proposal_approved','Proposta aprovada'],['awaiting_payment','Aguardando pagamento'],
 ['paid_awaiting_setup','Pago / Aguardando implantação'],['awaiting_meta_validation','Aguardando validação Meta'],['active','Ativo'],
] as const;
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
  const [officialApproval, setOfficialApproval] = useState(false);
  const [businessOnboarding,setBusinessOnboarding] = useState<BusinessOnboarding|null>(null);
  const [businessBilling,setBusinessBilling] = useState<BusinessBilling|null>(null);
  const [businessMonthly,setBusinessMonthly] = useState('489');
  const [businessSetup,setBusinessSetup] = useState('399');
  const [setupOrderId,setSetupOrderId] = useState('');
  const [setupWaiverReason,setSetupWaiverReason] = useState('');
  const [businessNumberSource,setBusinessNumberSource] = useState<'customer'|'tendidesk'>('customer');
  const [billingVerified, setBillingVerified] = useState(false);
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

    const [orgRes, planRes, memberRes, channelRes, agentRes, grantRes, approvalRes, onboardingRes] = await Promise.all([
      supabase.from('organizations').select(`id,name,slug,status,plan_code,created_at,trial_ends_at,${COMPLIMENTARY_COLUMNS}`).eq('id', organizationId).maybeSingle(),
      supabase.from('subscription_plans').select('code,name').order('display_order'),
      supabase.from('organization_memberships').select('user_id,role,status').eq('organization_id', organizationId),
      supabase.from('channel_connections').select('status,settings,provider_account_id').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
      supabase.from('ai_agents').select('is_enabled').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('support_access_grants').select(`${SUPPORT_GRANT_COLUMNS},redeemed_by`).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(8),
      fetch(`/api/admin/organizations/${organizationId}/official-approval`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/admin/organizations/${organizationId}/business-onboarding`,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);
    if (!orgRes.data) { setOrganization(null); setLoading(false); return; }
    const org = orgRes.data as Organization;
    setOrganization(org);
    setPlans((planRes.data ?? []) as Plan[]);
    setWhatsapp((channelRes.data as { status?: string } | null)?.status ?? null);
    setWhatsappRow((channelRes.data as WhatsappRow | null) ?? null);
    setAiEnabled(Boolean((agentRes.data as { is_enabled?: boolean } | null)?.is_enabled));
    setOfficialApproval(approvalRes?.approved === true);
    setBusinessOnboarding(onboardingRes?.onboarding??null);
    setBusinessBilling(onboardingRes?.billing??null);
    setBillingVerified(approvalRes?.billingVerified === true);
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

  async function setupPayment(action:'create'|'verify'|'waive'){
    if(action==='waive'&&!window.confirm('Isentar a taxa de implantação? Esta ação será auditada.'))return;
    setBusy('setup-payment');setMessage(null);
    const response=await fetch(`/api/admin/organizations/${organizationId}/business-onboarding/setup-payment`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,orderId:setupOrderId,reason:setupWaiverReason}),
    }).catch(()=>null);
    const result=response?await response.json().catch(()=>({})):{};
    setBusy('');
    if(!response?.ok){setMessage({ok:false,text:result.error??'Não foi possível consultar a cobrança.'});return;}
    setMessage({ok:true,text:action==='create'?'Link avulso gerado. Envie ao cliente e aguarde pagamento.':action==='verify'?'Pagamento confirmado diretamente na Pagar.me.':'Isenção registrada.'});
    await load();
  }

  async function changeBusiness(action:'create'|'advance',toStatus?:string){
    setBusy('business');setMessage(null);
    const body=action==='create'?{
      action,monthlyCents:Math.round(Number(businessMonthly)*100),
      setupCents:Math.round(Number(businessSetup)*100),numberSource:businessNumberSource,
    }:{action,toStatus};
    const response=await fetch(`/api/admin/organizations/${organizationId}/business-onboarding`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    }).catch(()=>null);
    const payload=response?await response.json().catch(()=>({})):{};
    setBusy('');
    if(!response?.ok){setMessage({ok:false,text:typeof payload.error==='string'?payload.error:'Falha na contratação Business.'});return;}
    setMessage({ok:true,text:'Etapa Business atualizada. Nenhuma cobrança foi criada automaticamente.'});
    await load();
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

        {internal ? <section className={card}>
          <h2 className="td-title text-base">Workspace interno — recursos liberados</h2>
          <p className="mt-2 text-sm text-slate-600">A operação interna do TendiDesk não precisa contratar assinatura nem pagar taxa de implantação. Para conectar o WhatsApp por QR Code ou API oficial, abra o workspace e utilize Conexões. A API oficial continua sujeita à validação técnica e às tarifas da conta Meta utilizada.</p>
          <Link href={`/inbox?organization=${organization.id}`} className={`${secondary} mt-4 inline-flex`}>Abrir workspace para gerenciar conexões</Link>
        </section> : <section className={card}>
          <h2 className="td-title text-base">Implantação assistida — TendiDesk Business</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">A proposta e a cobrança são separadas. A mensalidade deve ser criada e vinculada no Pagar.me; a etapa paga exige confirmação de pagamento recebida por webhook. A ativação Meta exige aprovação financeira independente.</p>
          {!businessOnboarding ? <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs">Mensalidade proposta (R$)<input className={field} inputMode="decimal" value={businessMonthly} onChange={e=>setBusinessMonthly(e.target.value)}/></label>
            <label className="text-xs">Implantação (R$)<input className={field} inputMode="decimal" value={businessSetup} onChange={e=>setBusinessSetup(e.target.value)}/></label>
            <label className="text-xs">Número<select className={field} value={businessNumberSource} onChange={e=>setBusinessNumberSource(e.target.value as 'customer'|'tendidesk')}><option value="customer">Do cliente</option><option value="tendidesk">Fornecido pelo TendiDesk</option></select></label>
            <button type="button" className={primary} disabled={busy==='business'} onClick={()=>void changeBusiness('create')}>Abrir solicitação Business</button>
          </div> : <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">{businessStages.map(([key,label],i)=>{
              const index=businessStages.findIndex(([status])=>status===businessOnboarding.status);
              return <span key={key} className={`rounded-full px-3 py-1 text-xs ${i===index?'bg-teal-100 font-semibold text-teal-800':i<index?'bg-slate-100 text-slate-600':'border border-slate-200 text-slate-400'}`}>{label}</span>;
            })}</div>
            <p className="text-xs text-slate-600">Proposta: R$ {(businessOnboarding.proposed_monthly_cents/100).toFixed(2)} por mês + R$ {(businessOnboarding.setup_fee_cents/100).toFixed(2)} de implantação. Número: {businessOnboarding.number_source==='customer'?'do cliente':'fornecido pelo TendiDesk'}.</p>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold">Implantação avulsa — {businessOnboarding.setup_payment_status==='paid'?'Paga':businessOnboarding.setup_payment_status==='waived'?'Isenta':businessOnboarding.setup_payment_status==='pending'?'Aguardando pagamento':'Não cobrada'}</p>
              <p className="text-xs text-slate-600">Cobrança única separada da mensalidade. A etapa de implantação só avança com os dois pagamentos confirmados ou isenção justificada.</p>
              {businessOnboarding.setup_payment_url&&<a href={businessOnboarding.setup_payment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-800 underline">Abrir link de pagamento da implantação</a>}
              {['proposal_approved','awaiting_payment'].includes(businessOnboarding.status)&&!['paid','waived'].includes(businessOnboarding.setup_payment_status??'')&&<div className="flex flex-wrap items-end gap-2">
                {(!businessOnboarding.setup_payment_status||businessOnboarding.setup_payment_status==='not_created')&&<button type="button" className={secondary} disabled={busy==='setup-payment'} onClick={()=>void setupPayment('create')}>Gerar cobrança avulsa</button>}
                {businessOnboarding.setup_payment_status==='pending'&&<><label className="text-xs">ID do pedido pago (or_...)<input className={field} value={setupOrderId} onChange={e=>setSetupOrderId(e.target.value)} placeholder="or_..."/></label><button type="button" className={secondary} disabled={busy==='setup-payment'} onClick={()=>void setupPayment('verify')}>Verificar pagamento</button></>}
                <label className="text-xs">Motivo de isenção<input className={field} value={setupWaiverReason} onChange={e=>setSetupWaiverReason(e.target.value)} placeholder="Motivo registrado para auditoria"/></label>
                <button type="button" className={secondary} disabled={busy==='setup-payment'||setupWaiverReason.trim().length<12} onClick={()=>void setupPayment('waive')}>Isentar implantação</button>
              </div>}
            </div>
            {businessOnboarding.status==='awaiting_payment'&&<p className="text-xs text-amber-800">Crie/vincule o plano Business no Pagar.me e aguarde o evento de pagamento confirmado. Não marque como pago apenas pela criação da assinatura.</p>}
            <p className="text-xs text-slate-600">Pagar.me: {businessBilling?.plan_code==='tendi_business'?`${businessBilling.status} · ${businessBilling.last_event_type??'sem evento'}`:'assinatura Business ainda não vinculada'}.</p>
            {businessOnboarding.status!=='active'&&<button type="button" className={secondary} disabled={busy==='business'} onClick={()=>{
              const index=businessStages.findIndex(([key])=>key===businessOnboarding.status);
              const next=businessStages[index+1];
              if(next&&window.confirm(`Avançar para "${next[1]}"? A cobrança não será criada por esta ação.`))void changeBusiness('advance',next[0]);
            }}>Avançar para próxima etapa</button>}
          </div>}
        </section>}

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

            <div className="mt-5 rounded-xl border border-tendi-line bg-tendi-haze p-4">
              <p className="text-sm font-semibold text-tendi-navy">API oficial da Meta — aprovação comercial</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">Disponível no Business. Confirme com o cliente a titularidade e o responsável financeiro pela conta Meta antes de liberar a autorização no TendiDesk. Não cria cobrança automática.</p>
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={billingVerified} disabled={officialApproval} onChange={e => setBillingVerified(e.target.checked)} />
                Confirmei que o cliente será o responsável financeiro na Meta e não utilizará crédito da plataforma
              </label>
              <button type="button" className={secondary} disabled={busy === 'approval' || (!officialApproval && (organization.plan_code !== 'tendi_business' || !billingVerified))} onClick={async () => {
                if (!window.confirm(officialApproval ? 'Revogar a autorização de novas conexões oficiais?' : 'Aprovar a conexão oficial após verificar o faturamento Meta do cliente?')) return;
                if (await call('approval','PATCH',{action:'set_official_whatsapp_approval',approved:!officialApproval,billingVerified:!officialApproval&&billingVerified},officialApproval?'Autorização revogada.':'WhatsApp oficial autorizado para conexão pelo cliente.')) await load();
              }}>{officialApproval ? 'Revogar autorização' : 'Aprovar conexão oficial'}</button>
              <p className="mt-2 text-xs text-slate-500">{officialApproval ? 'Autorizado: o cliente pode conectar diretamente no TendiDesk.' : 'Aguardando aprovação do suporte.'}</p>
            </div>
            <div className="mt-5 border-t border-tendi-line/70 pt-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-tendi-navy"><BadgeCheck size={15} className="text-tendi-teal" />Número oficial (API da Meta)</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Para este cliente usar um número da API oficial: reserve a sessão, copie o código e, no painel do On Connect, use <strong>Conexões › Nova conexão Meta › Workspace do Tendi</strong>. Se ele já usa QR Code, marque <strong>Substituir a conexão atual</strong>.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-tendi-haze px-3 py-2 font-mono text-xs text-tendi-navy">{sessionIdFor(organization.id, whatsappRow?.provider_account_id)}</code>
                <button type="button" onClick={() => void copySession(sessionIdFor(organization.id, whatsappRow?.provider_account_id))} className={secondary}><Copy size={14} />{copied ? 'Copiado' : 'Copiar código'}</button>
                {whatsappRow?.provider_account_id !== stableSessionId(organization.id) && <button type="button" disabled={busy === 'official'} onClick={() => void prepareOfficial()} className={primary}>{busy === 'official' && <Loader2 size={14} className="animate-spin" />}{whatsappRow ? 'Usar este código para o oficial' : 'Reservar sessão'}</button>}
              </div>
              {whatsappRow?.provider_account_id !== stableSessionId(organization.id) && <p className="mt-2 text-[11px] text-amber-700">{whatsappRow ? 'Este workspace já tem uma conexão (provavelmente QR Code) com outro código. Clique no botão para alinhar a sessão ao código acima antes de ligar o número no On Connect.' : 'Reserve a sessão antes de ligar o número no On Connect: sem ela, o TendiDesk não recebe as mensagens deste workspace.'}</p>}
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
