'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MailPlus, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';
import { ROLE_INFO, ROLES, type Role } from '@/lib/team';

type Member = { userId: string; name: string; email: string; role: Role; status: string; invitedAt: string | null; teams: Array<{ id: string; name: string }>; canManage: boolean; isSelf: boolean };
type TeamData = { members: Member[]; seats: { used: number; limit: number | null }; actorRole: Role; assignableRoles: Role[] };
type Sector = { id: string; name: string };

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#7C7EC0]';
const ROLE_TONE: Record<Role, string> = {
  owner: 'bg-[#2F316B] text-white',
  admin: 'bg-[#F0F0FA] text-[#2F316B]',
  manager: 'bg-[#E8F4F2] text-[#004751]',
  agent: 'bg-slate-100 text-slate-600',
};

export default function TeamPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [data, setData] = useState<TeamData | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'agent' as Role, teamId: '' });

  const load = useCallback(async (orgId: string) => {
    const response = await fetch(`/api/team?organization=${orgId}`).catch(() => null);
    const json = await response?.json().catch(() => null);
    if (response?.ok) setData(json as TeamData);
    else setMessage({ ok: false, text: json?.error ?? 'Não foi possível carregar a equipe.' });
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient() as any;
      const { data: orgs } = await supabase.from('organizations').select('id').order('name');
      const requested = new URLSearchParams(window.location.search).get('organization');
      const orgId = (orgs ?? []).find((org: { id: string }) => org.id === requested)?.id ?? orgs?.[0]?.id;
      if (!orgId) { setLoading(false); return; }
      setOrganizationId(orgId);
      const { data: teamRows } = await supabase.from('teams').select('id,name').eq('organization_id', orgId).eq('is_active', true).order('name');
      setSectors((teamRows ?? []) as Sector[]);
      await load(orgId);
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    if (data?.assignableRoles.length && !data.assignableRoles.includes(form.role)) setForm(current => ({ ...current, role: data.assignableRoles.at(-1)! }));
  }, [data, form.role]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy('invite'); setMessage(null);
    const response = await fetch('/api/team', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, ...form }) }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy('');
    if (!response?.ok) { setMessage({ ok: false, text: json?.error ?? 'Não foi possível convidar.' }); return; }
    setMessage({ ok: true, text: json.message });
    setForm(current => ({ ...current, fullName: '', email: '' }));
    await load(organizationId);
  }

  async function changeRole(member: Member, role: Role) {
    setBusy(member.userId); setMessage(null);
    const response = await fetch(`/api/team/members/${member.userId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, role }) }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy('');
    if (!response?.ok) { setMessage({ ok: false, text: json?.error ?? 'Não foi possível alterar o papel.' }); return; }
    setMessage({ ok: true, text: `${member.name} agora é ${ROLE_INFO[role].label}.` });
    await load(organizationId);
  }

  async function resend(member: Member) {
    setBusy(member.userId); setMessage(null);
    const response = await fetch(`/api/team/members/${member.userId}/resend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId }) }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy('');
    setMessage(response?.ok ? { ok: true, text: json?.message ?? 'Convite reenviado.' } : { ok: false, text: json?.error ?? 'Não foi possível reenviar o convite.' });
    if (response?.ok) await load(organizationId);
  }

  async function remove(member: Member) {
    const pending = member.status === 'invited';
    if (!window.confirm(pending ? `Cancelar o convite de ${member.email}?` : `Remover ${member.name} da equipe? As conversas atribuídas a essa pessoa voltam para a fila.`)) return;
    setBusy(member.userId); setMessage(null);
    const response = await fetch(`/api/team/members/${member.userId}?organization=${organizationId}`, { method: 'DELETE' }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy('');
    if (!response?.ok) { setMessage({ ok: false, text: json?.error ?? 'Não foi possível remover.' }); return; }
    setMessage({ ok: true, text: pending ? 'Convite cancelado.' : `${member.name} foi removido(a) da equipe.` });
    await load(organizationId);
  }

  const canInvite = Boolean(data?.assignableRoles.length);
  const full = Boolean(data?.seats.limit && data.seats.used >= data.seats.limit);

  return <WorkspaceShell title="Equipe" description="Convide pessoas e defina o que cada uma pode fazer">
    {loading ? <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-[#2F316B]" /></div> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-[#F0F0FA] p-2.5 text-[#2F316B]"><UsersRound size={18} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Pessoas</h2><p className="text-xs text-slate-400">{data ? `${data.seats.used}${data.seats.limit ? ` de ${data.seats.limit}` : ''} usuários do plano` : ''}</p></div></div>
          {data?.seats.limit ? <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100"><div className={full ? 'h-full bg-rose-500' : 'h-full bg-[#004751]'} style={{ width: `${Math.min(100, (data.seats.used / data.seats.limit) * 100)}%` }} /></div> : null}
        </div>
        {message && <p role="status" className={message.ok ? 'mx-5 mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700' : 'mx-5 mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700'}>{message.text}</p>}
        <ul className="divide-y divide-slate-100">{(data?.members ?? []).map(member => <li key={member.userId} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E9EAF8] to-[#F9E8F5] text-xs font-bold text-[#2F316B]">{member.name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{member.name}{member.isSelf && <span className="ml-2 text-[11px] font-normal text-slate-400">(você)</span>}</p>
            <p className="truncate text-xs text-slate-400">{member.email}{member.teams.length ? ` · ${member.teams.map(team => team.name).join(', ')}` : ''}</p>
          </div>
          {member.status === 'invited' && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Convite pendente</span>}{member.status === 'invited' && member.canManage && <button type="button" onClick={() => void resend(member)} disabled={busy !== ''} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-[#004751] hover:bg-slate-50 disabled:opacity-50">Reenviar convite</button>}
          {member.canManage && data
            ? <select aria-label={`Papel de ${member.name}`} value={member.role} disabled={busy !== ''} onChange={e => void changeRole(member, e.target.value as Role)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">{data.assignableRoles.map(role => <option key={role} value={role}>{ROLE_INFO[role].label}</option>)}</select>
            : <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_TONE[member.role]}`}>{ROLE_INFO[member.role].label}</span>}
          {member.canManage && <button type="button" onClick={() => void remove(member)} disabled={busy !== ''} title={member.status === 'invited' ? 'Cancelar convite' : 'Remover da equipe'} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{busy === member.userId ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}</button>}
        </li>)}</ul>
      </section>

      <div className="space-y-5">
        {canInvite ? <form onSubmit={invite} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#FDF0FA] p-2.5 text-[#CB0A9F]"><MailPlus size={18} /></span><div><h2 className="text-sm font-bold text-[#2F316B]">Convidar pessoa</h2><p className="text-xs text-slate-400">Ela recebe um e-mail para criar a senha.</p></div></div>
          <label className="block text-xs font-semibold text-slate-600">Nome<input required minLength={2} maxLength={120} value={form.fullName} onChange={e => setForm(current => ({ ...current, fullName: e.target.value }))} className={`${input} mt-1`} placeholder="Ex.: Ana Souza" /></label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">E-mail<input required type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} className={`${input} mt-1`} placeholder="ana@suaempresa.com.br" /></label>
          <fieldset className="mt-3"><legend className="text-xs font-semibold text-slate-600">Papel</legend><div className="mt-1 space-y-2">{data!.assignableRoles.map(role => <label key={role} className={form.role === role ? 'flex cursor-pointer gap-3 rounded-xl border border-[#004751] bg-[#F3FAF9] p-3' : 'flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50'}><input type="radio" name="role" value={role} checked={form.role === role} onChange={() => setForm(current => ({ ...current, role }))} className="mt-0.5" /><span><span className="block text-xs font-semibold text-slate-700">{ROLE_INFO[role].label}</span><span className="block text-[11px] text-slate-500">{ROLE_INFO[role].description}</span></span></label>)}</div></fieldset>
          {sectors.length > 0 && <label className="mt-3 block text-xs font-semibold text-slate-600">Setor (opcional)<select value={form.teamId} onChange={e => setForm(current => ({ ...current, teamId: e.target.value }))} className={`${input} mt-1`}><option value="">Sem setor</option>{sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>}
          <button disabled={busy !== '' || full} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white hover:bg-[#003943] disabled:opacity-50">{busy === 'invite' && <Loader2 size={15} className="animate-spin" />}{full ? 'Limite de usuários do plano atingido' : 'Enviar convite'}</button>
        </form> : <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm"><ShieldCheck className="mb-2 text-[#004751]" size={18} />Como Supervisor você acompanha a equipe. Convites e mudanças de papel ficam com o Dono e os Administradores.</div>}

        <section className="rounded-2xl border border-[#2F316B]/10 bg-[#F0F1FA] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#2F316B]"><UserRound size={16} />Quem faz o quê</h2>
          <ul className="mt-3 space-y-2.5">{ROLES.map(role => <li key={role} className="text-xs text-slate-600"><span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_TONE[role]}`}>{ROLE_INFO[role].label}</span>{ROLE_INFO[role].description}</li>)}</ul>
        </section>
      </div>
    </div>}
  </WorkspaceShell>;
}
