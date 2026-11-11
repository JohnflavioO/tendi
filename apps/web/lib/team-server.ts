import type { SupabaseClient } from '@supabase/supabase-js';
import { assignableRoles, canManageMember, checkSeats, isRole, normalizeEmail, ROLE_INFO, type Role } from './team';

/**
 * Operações da equipe (sempre no servidor, com a chave de serviço, depois de identificar quem pede).
 * As regras de quem pode o quê ficam em ./team.ts.
 */

type Db = SupabaseClient<any, any, any>;
export type Actor = { userId: string; role: Role };
export type Outcome<T = Record<string, unknown>> = { status: number; body: T | { error: string } };
/** Envia o convite do Supabase Auth e devolve o id do usuário criado. */
export type InviteUserFn = (email: string, fullName: string) => Promise<string>;

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
  inviteUser: InviteUserFn,
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
  let userId: string;
  let invited: boolean;
  if (existing?.id) {
    const { data: already } = await db.from('organization_memberships').select('status').eq('organization_id', input.organizationId).eq('user_id', existing.id).maybeSingle();
    if (already) return fail(409, already.status === 'invited' ? 'Esta pessoa já foi convidada e ainda não aceitou.' : 'Esta pessoa já faz parte da equipe.');
    userId = existing.id as string;
    invited = false;
  } else {
    try {
      userId = await inviteUser(email, fullName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Equipe] convite não enviado', { message });
      return fail(502, /rate limit/i.test(message) ? 'Muitos convites em pouco tempo. Tente de novo em alguns minutos.' : 'Não foi possível enviar o convite agora.');
    }
    invited = true;
  }

  const now = new Date().toISOString();
  const { error } = await db.from('organization_memberships').insert({
    organization_id: input.organizationId,
    user_id: userId,
    role,
    // Conta nova fica "convidada" até abrir o link; conta que já existe entra direto.
    status: invited ? 'invited' : 'active',
    invited_by: actor.userId,
    invited_at: now,
  });
  if (error) return fail(500, 'Não foi possível adicionar a pessoa à equipe.');

  if (teamId) {
    await db.from('team_members').insert({ organization_id: input.organizationId, team_id: teamId, user_id: userId, team_role: role === 'agent' ? 'member' : 'leader' });
  }
  return {
    status: 200,
    body: invited
      ? { ok: true, invited: true, message: `Convite enviado para ${email}.` }
      : { ok: true, invited: false, message: `${fullName} já tinha conta no Tendi e foi adicionado(a) à equipe. Basta entrar com o e-mail e a senha de sempre.` },
  };
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
