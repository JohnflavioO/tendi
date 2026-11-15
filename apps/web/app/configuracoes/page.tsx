'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2, Users, Save, Loader2, ShieldCheck, CreditCard, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { requestedOrganizationId, resolveCurrentOrganization, withOrganization } from '@/lib/current-organization';
import { WorkspaceShell } from '@/components/workspace-shell';
import { AiUsageNotice } from '@/components/ai-usage-notice';
import { AccountCard } from '@/components/settings/account-card';
import { SignatureSettingsCard } from '@/components/settings/signature-settings';
import { SupportAccessCard } from '@/components/settings/support-access';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { canAccess, ROLE_INFO } from '@/lib/team';
import { planStatus, type PlanStatus } from '@/lib/plan-status';

type Team = { id: string; name: string; description: string | null; color: string; is_active: boolean };
type Org = { id: string; name: string; slug: string; plan_code: string | null; status: string; trial_ends_at: string | null };

const TONE: Record<PlanStatus['tone'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  trial: 'bg-tendi-mist text-tendi-indigo ring-[#D9DAF0]',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  blocked: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function SettingsPage() {
  const supabase = createClient() as any;
  const [org, setOrg] = useState<Org | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{ status: string; billing_period: string | null } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { role, superAdmin } = useWorkspaceRole(org?.id);
  const canEditCompany = canAccess(role, 'assinatura') || (superAdmin && !role);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { organization: o } = await resolveCurrentOrganization<Org>(supabase, u.user.id, 'id,name,slug,plan_code,status,trial_ends_at', requestedOrganizationId());
    if (!o) { setLoading(false); return; }
    setOrg(o); setName(o.name ?? '');
    const [plan, sub, t] = await Promise.all([
      o.plan_code ? supabase.from('subscription_plans').select('name').eq('code', o.plan_code).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('billing_subscriptions').select('status,billing_period').eq('organization_id', o.id).maybeSingle(),
      supabase.from('teams').select('id,name,description,color,is_active').eq('organization_id', o.id).order('created_at'),
    ]);
    if (t.error) throw t.error;
    setPlanName(plan.data?.name ?? null);
    setSubscription(sub.data ?? null);
    setTeams(t.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load().catch(e => { setMessage(e.message); setLoading(false); }); }, []);

  async function saveName() {
    if (!org || !name.trim()) return;
    setSaving(true); setMessage('');
    const { error } = await supabase.from('organizations').update({ name: name.trim() }).eq('id', org.id);
    setMessage(error ? 'Não foi possível salvar o nome da empresa.' : 'Nome da empresa atualizado.');
    if (!error) setOrg({ ...org, name: name.trim() });
    setSaving(false);
  }
  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim() || !org) return;
    setSaving(true);
    const { error } = await supabase.from('teams').insert({ organization_id: org.id, name: teamName.trim() });
    setMessage(error ? 'Não foi possível criar o setor.' : 'Setor criado.');
    if (!error) { setTeamName(''); await load(); }
    setSaving(false);
  }

  const status = org ? planStatus({ status: org.status, trialEndsAt: org.trial_ends_at, subscriptionStatus: subscription?.status, billingPeriod: subscription?.billing_period }) : null;
  const card = 'td-card p-5';

  return <WorkspaceShell title="Configurações" description="Sua conta, dados da empresa, setores e preferências">
    {loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-tendi-indigo" /></div> : <div className="grid gap-5 xl:grid-cols-2">
      <AccountCard role={role} superAdmin={superAdmin} />

      <section className={card}>
        <div className="mb-5 flex items-center gap-3"><span className="td-icon"><Building2 size={20} /></span><div><h2 className="td-title">Dados da empresa</h2><p className="text-xs text-slate-400">Nome que aparece para a equipe e no TendiDesk</p></div></div>
        <label className="mb-4 block"><span className="td-label">Nome da empresa</span>
          <input value={name} disabled={!canEditCompany} onChange={e => setName(e.target.value)} className="td-input" />
          {!canEditCompany && <span className="mt-1 block text-[11px] text-slate-400">Só o dono ou um administrador altera o nome.</span>}
        </label>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="td-subtle p-3"><p className="td-eyebrow">Plano</p><p className="mt-1 text-sm font-semibold text-slate-800">{planName ?? '—'}</p></div>
          <div className="td-subtle p-3"><p className="td-eyebrow">Situação</p>{status && <><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONE[status.tone]}`}>{status.label}</span><p className="mt-1 text-[11px] leading-4 text-slate-400">{status.detail}</p></>}</div>
        </div>
        <div className="mb-4"><AiUsageNotice organizationId={org?.id} /></div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditCompany && <button disabled={saving || !name.trim() || name.trim() === org?.name} onClick={() => void saveName()} className="td-btn td-btn-teal  disabled:opacity-50"><Save size={14} />Salvar nome</button>}
          {canAccess(role, 'assinatura') && <Link href={withOrganization('/assinatura', org?.id)} className="td-btn td-btn-secondary"><CreditCard size={14} />Plano e assinatura</Link>}
        </div>
      </section>

      <section className={card}>
        <div className="mb-5 flex items-center gap-3"><span className="td-icon td-icon-teal"><Users size={20} /></span><div><h2 className="td-title">Setores de atendimento</h2><p className="text-xs text-slate-400">Ex.: Comercial, Suporte, Financeiro. Usados para direcionar as conversas.</p></div></div>
        <form onSubmit={addTeam} className="mb-4 flex gap-2"><input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Nome do novo setor" className="td-input min-w-0 flex-1" /><button disabled={saving || !teamName.trim()} className="td-btn td-btn-primary  disabled:opacity-50">Adicionar</button></form>
        <div className="space-y-2">{teams.map(t => <div key={t.id} className="flex items-center justify-between rounded-xl bg-tendi-haze/60 px-3 py-3"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} /><span className="text-xs font-semibold text-slate-700">{t.name}</span></div><span className={t.is_active ? 'text-[10px] text-emerald-700' : 'text-[10px] text-slate-400'}>{t.is_active ? 'Ativo' : 'Inativo'}</span></div>)}{!teams.length && <p className="py-5 text-center text-xs text-slate-400">Nenhum setor cadastrado.</p>}</div>
      </section>

      {org?.id && <SignatureSettingsCard organizationId={org.id} />}
      {org?.id && <SupportAccessCard organizationId={org.id} />}

      <section className={`${card} xl:col-span-2`}>
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-tendi-teal" size={20} /><div>
          <h2 className="td-title">Segurança e permissões</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Cada pessoa da equipe tem seu próprio login e um papel que define o que ela vê: <b>Dono</b> e <b>Administrador</b> cuidam de tudo, inclusive assinatura e Agente de IA; <b>Supervisor</b> gerencia conexões, equipe e relatórios; <b>Atendente</b> fica com Inbox, Agenda, CRM e Contatos. Essas regras também são aplicadas no banco de dados, não só na tela.</p>
          <p className="mt-2 text-xs text-slate-500">Seu papel: <b className="text-tendi-indigo">{role ? ROLE_INFO[role].label : superAdmin ? 'Super Admin' : '—'}</b>{canAccess(role, 'equipe') && <Link href={withOrganization('/equipe', org?.id)} className="ml-3 inline-flex items-center gap-1 font-semibold text-tendi-teal hover:underline">Gerenciar equipe<ArrowRight size={12} /></Link>}</p>
        </div></div>
      </section>
    </div>}
    {message && <p className="mt-4 rounded-xl bg-tendi-mist p-3 text-xs text-tendi-indigo">{message}</p>}
  </WorkspaceShell>;
}
