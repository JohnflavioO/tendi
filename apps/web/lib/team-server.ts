import type { SupabaseClient } from '@supabase/supabase-js';
import { assignableRoles, canManageMember, checkSeats, isRole, normalizeEmail, ROLE_INFO, type Role } from './team';

/**
 * Operações da equipe (sempre no servidor, com a chave de serviço, depois de identificar quem pede).
 * As regras de quem pode o quê ficam em ./team.ts.
 */

type Db = SupabaseClient<any, any, any>;
export type Actor = { userId: string; role: Role };
export type Outcome<T = Record<string, unknown>> = { status: number; body: T | { error: string } };
/** Dados que personalizam o e-mail de convite (empresa, quem convidou, papel). */
export type InviteContext = { organizationName: string; inviterName: string; roleLabel: string };

/** Operações do Supabase Auth usadas no convite (injetadas pela rota; nos testes, simuladas). */
export type AuthOps = {
  /** Conta nova: envia o e-mail de convite e devolve o id do usuário criado. */
  invite: (email: string, fullName: string, context: InviteContext) => Promise<string>;
  /** Conta que existe mas nunca entrou: envia um novo link de acesso por e-mail. */
  resend: (email: string) => Promise<void>;
  /** A pessoa já entrou e criou a senha? */
  isActivated: (userId: string) => Promise<boolean>;
};

const friendlyAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[Equipe] e-mail de convite não enviado', { message });
  return /rate limit|too many|security purposes/i.test(message)
    ? 'Muitos e-mails em pouco tempo. Tente de novo em alguns minutos.'
    : 'Não foi possível enviar o e-mail agora.';
};

async function inviteContext(db: Db, organizationId: string, actor: Actor, role: Role): Promise<InviteContext> {
  const [{ data: org }, { data: inviter }] = await Promise.all([
    db.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
    db.from('profiles').select('full_name,email').eq('id', actor.userId).maybeSingle(),
  ]);
  const inviterName = String(inviter?.full_name || inviter?.email?.split('@')[0] || '').trim().split(' ')[0] || 'A equipe';
  return { organizationName: String(org?.name ?? 'sua empresa'), inviterName, roleLabel: ROLE_INFO[role].label };
}

const fail = (status: number, error: string): Outcome<never> => ({ status, body: { error } });

/** Papel de quem pede: Super Admin vale como dono; senão o vínculo ativo com a empresa. */
export async function resolveActor(userDb: Db, userId: string, organizationId: string): Promise<Actor | null> {
  const [{ data: superAdmin }, { data: membership }] = await Promise.all([
    userDb.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    userDb.from('organization_memberships').select('role,status').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
  ]);
  if (superAdmin) return { userId, role: 'owner' };
  if (membership?.status === 'active' && isRole(membership.role)) return { userId, role: membership.role };
  return null;
}

async function seatLimit(db: Db, organizationId: string): Promise<{ used: number; limit: number | null }> {
  const { data: org } = await db.from('organizations').select('plan_code').eq('id', organizationId).maybeSingle();
  const plan = org?.plan_code
    ? (await db.from('subscription_plans').select('max_attendants').eq('code', org.plan_code).maybeSingle()).data
    : null;
  const { count } = await db.from('organization_memberships').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).in('status', ['active', 'invited']);
  return { used: count ?? 0, limit: (plan?.max_attendants as number | undefined) ?? null };
}

export type MemberRow = {
  userId: string; name: string; email: string; role: Role; status: string;
  invitedAt: string | null; teams: Array<{ id: string; name: string }>; canManage: boolean; isSelf: boolean;
};

export async function listMembers(db: Db, organizationId: string, actor: Actor) {
  const [{ data: memberships }, { data: teamLinks }, seats] = await Promise.all([
    db.from('organization_memberships').select('user_id,role,status,invited_at,created_at').eq('organization_id', organizationId).order('created_at'),
    db.from('team_members').select('user_id,teams(id,name)').eq('organization_id', organizationId),
    seatLimit(db, organizationId),
  ]);
  const ids = ((memberships ?? []) as Array<{ user_id: string }>).map(row => row.user_id);
  const { data: profiles } = ids.length ? await db.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] };
  const profileOf = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(p => [p.id, p]));
  const members: MemberRow[] = ((memberships ?? []) as Array<{ user_id: string; role: Role; status: string; invited_at: string | null }>).map(row => {
    const profile = profileOf.get(row.user_id);
    const teams = ((teamLinks ?? []) as Array<{ user_id: string; teams: any }>)
      .filter(link => link.user_id === row.user_id)
      .flatMap(link => (Array.isArray(link.teams) ? link.teams : link.teams ? [link.teams] : []))
      .map((team: { id: string; name: string }) => ({ id: team.id, name: team.name }));
    const isSelf = row.user_id === actor.userId;
    return {
      userId: row.user_id,
      name: profile?.full_name || profile?.email?.split('@')[0] || 'Usuário',
      email: profile?.email ?? '',
      role: row.role,
      status: row.status,
      invitedAt: row.invited_at,
      teams,
      isSelf,
      canManage: canManageMember(actor.role, row.role, isSelf),
    };
  });
  return { members, seats, actorRole: actor.role, assignableRoles: assignableRoles(actor.role) };
}

export async function inviteMember(
  db: Db,
  actor: Actor,
  input: { organizationId: string; email: unknown; fullName: unknown; role: unknown; teamId?: unknown },
  auth: AuthOps,
): Promise<Outcome> {
  const email = normalizeEmail(input.email);
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().slice(0, 120) : '';
  if (!email) return fail(400, 'Informe um e-mail válido.');
  if (fullName.length < 2) return fail(400, 'Informe o nome da pessoa.');
  if (!isRole(input.role) || !assignableRoles(actor.role).includes(input.role)) {
    return fail(403, `Você não pode convidar alguém como ${isRole(input.role) ? ROLE_INFO[input.role].label : 'esse papel'}.`);
  }
  const role = input.role;

  const seats = await seatLimit(db, input.organizationId);
  const check = checkSeats(seats.used, seats.limit);
  if (!check.ok) return fail(409, check.error);

  const teamId = typeof input.teamId === 'string' && input.teamId ? input.teamId : null;
  if (teamId) {
    const { data: team } = await db.from('teams').select('id').eq('id', teamId).eq('organization_id', input.organizationId).maybeSingle();
    if (!team) return fail(400, 'Setor inválido.');
  }

  const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  // 'invited' = conta nova (e-mail de convite); 'reminded' = conta que nunca entrou (novo link); 'joined' = já usa o TendiDesk.
  let userId: string;
  let outcome: 'invited' | 'reminded' | 'joined';
  if (existing?.id) {
    const { data: already } = await db.from('organization_memberships').select('status').eq('organization_id', input.organizationId).eq('user_id', existing.id).maybeSingle();
    if (already) return fail(409, already.status === 'invited' ? 'Esta pessoa já foi convidada e ainda não aceitou. Use "Reenviar convite" na lista.' : 'Esta pessoa já faz parte da equipe.');
    userId = existing.id as string;
    if (await auth.isActivated(userId)) {
      outcome = 'joined';
    } else {
      try { await auth.resend(email); } catch (error) { return fail(502, friendlyAuthError(error)); }
      outcome = 'reminded';
    }
  } else {
    try {
      userId = await auth.invite(email, fullName, await inviteContext(db, input.organizationId, actor, role));
    } catch (error) {
      return fail(502, friendlyAuthError(error));
    }
    outcome = 'invited';
  }

  const now = new Date().toISOString();
  const { error } = await db.from('organization_memberships').insert({
    organization_id: input.organizationId,
    user_id: userId,
    role,
    // Fica "convidada" até a pessoa abrir o link e criar a senha; quem já usa o TendiDesk entra direto.
    status: outcome === 'joined' ? 'active' : 'invited',
    invited_by: actor.userId,
    invited_at: now,
  });
  if (error) return fail(500, 'Não foi possível adicionar a pessoa à equipe.');

  if (teamId) {
    await db.from('team_members').insert({ organization_id: input.organizationId, team_id: teamId, user_id: userId, team_role: role === 'agent' ? 'member' : 'leader' });
  }
  const messages = {
    invited: `Convite enviado para ${email}.`,
    reminded: `Enviamos um novo link de acesso para ${email}.`,
    joined: `${fullName} já usa o TendiDesk e foi adicionado(a) à equipe. Basta entrar com o e-mail e a senha de sempre.`,
  };
  return { status: 200, body: { ok: true, invited: outcome !== 'joined', message: messages[outcome] } };
}

/** Reenvia o link de acesso para quem foi convidado e ainda não entrou. */
export async function resendInvite(db: Db, actor: Actor, input: { organizationId: string; userId: string }, auth: AuthOps): Promise<Outcome> {
  const target = await loadTarget(db, input.organizationId, input.userId);
  if (!target) return fail(404, 'Membro não encontrado.');
  if (target.status !== 'invited') return fail(409, 'Esta pessoa já aceitou o convite.');
  if (!canManageMember(actor.role, target.role, input.userId === actor.userId)) return fail(403, 'Você não pode reenviar este convite.');
  const { data: profile } = await db.from('profiles').select('email').eq('id', input.userId).maybeSingle();
  const email = normalizeEmail(profile?.email);
  if (!email) return fail(404, 'E-mail do convidado não encontrado.');
  try { await auth.resend(email); } catch (error) { return fail(502, friendlyAuthError(error)); }
  await db.from('organization_memberships').update({ invited_at: new Date().toISOString(), invited_by: actor.userId }).eq('organization_id', input.organizationId).eq('user_id', input.userId);
  return { status: 200, body: { ok: true, message: `Convite reenviado para ${email}.` } };
}

async function loadTarget(db: Db, organizationId: string, userId: string) {
  const { data } = await db.from('organization_memberships').select('role,status').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  return data && isRole(data.role) ? { role: data.role as Role, status: data.status as string } : null;
}

export async function changeRole(db: Db, actor: Actor, input: { organizationId: string; userId: string; role: unknown }): Promise<Outcome> {
  const target = await loadTarget(db, input.organizationId, input.userId);
  if (!target) return fail(404, 'Membro não encontrado.');
  if (!canManageMember(actor.role, target.role, input.userId === actor.userId)) return fail(403, 'Você não pode alterar o papel desta pessoa.');
  if (!isRole(input.role) || !assignableRoles(actor.role).includes(input.role)) return fail(403, 'Você não pode atribuir esse papel.');
  const { error } = await db.from('organization_memberships').update({ role: input.role }).eq('organization_id', input.organizationId).eq('user_id', input.userId);
  if (error) return fail(500, 'Não foi possível alterar o papel.');
  return { status: 200, body: { ok: true } };
}

export async function removeMember(db: Db, actor: Actor, input: { organizationId: string; userId: string }): Promise<Outcome> {
  const target = await loadTarget(db, input.organizationId, input.userId);
  if (!target) return fail(404, 'Membro não encontrado.');
  if (!canManageMember(actor.role, target.role, input.userId === actor.userId)) return fail(403, 'Você não pode remover esta pessoa.');
  // As conversas atribuídas a ela voltam para a fila da equipe.
  await db.from('conversations').update({ assigned_to: null }).eq('organization_id', input.organizationId).eq('assigned_to', input.userId);
  await db.from('team_members').delete().eq('organization_id', input.organizationId).eq('user_id', input.userId);
  const { error } = await db.from('organization_memberships').delete().eq('organization_id', input.organizationId).eq('user_id', input.userId);
  if (error) return fail(500, 'Não foi possível remover a pessoa.');
  return { status: 200, body: { ok: true } };
}

/** No primeiro acesso pelo link do convite, os convites pendentes viram vínculos ativos. */
export async function activateInvitations(db: Db, userId: string): Promise<number> {
  const { data } = await db.from('organization_memberships').update({ status: 'active' }).eq('user_id', userId).eq('status', 'invited').select('id');
  return Array.isArray(data) ? data.length : 0;
}
