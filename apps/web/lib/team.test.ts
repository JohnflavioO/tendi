import { describe, expect, it, vi } from 'vitest';
import { areaForPath, assignableRoles, canAccess, canManageMember, checkSeats, normalizeEmail } from './team';
import { activateInvitations, changeRole, inviteMember, listMembers, removeMember, resendInvite, resolveActor } from './team-server';

type Row = Record<string, any>;
class FakeDb {
  t: Record<string, Row[]> = { organizations: [], subscription_plans: [], organization_memberships: [], profiles: [], teams: [], team_members: [], conversations: [], platform_admins: [] };
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode = 'select'; preds: Array<(r: Row) => boolean> = []; payload: any; head = false; wantRows = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_c?: string, opts?: { head?: boolean }) { if (this.mode !== 'select') this.wantRows = true; this.head = Boolean(opts?.head); return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  delete() { this.mode = 'delete'; return this; }
  eq(c: string, v: any) { this.preds.push(r => r[c] === v); return this; }
  in(c: string, v: any[]) { this.preds.push(r => v.includes(r[c])); return this; }
  order() { return this; }
  private run(): any {
    const rows = this.db.t[this.table]!;
    const matched = rows.filter(r => this.preds.every(p => p(r)));
    if (this.mode === 'insert') { rows.push({ id: `${this.table}-${rows.length + 1}`, ...this.payload }); return { data: null, error: null }; }
    if (this.mode === 'update') { matched.forEach(r => Object.assign(r, this.payload)); return { data: this.wantRows ? matched : null, error: null }; }
    if (this.mode === 'delete') { this.db.t[this.table] = rows.filter(r => !matched.includes(r)); return { data: null, error: null }; }
    return { data: this.head ? null : matched, count: matched.length, error: null };
  }
  maybeSingle() { const r = this.run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  then(resolve: any, reject: any) { return Promise.resolve(this.run()).then(resolve, reject); }
}

const ORG = 'org1';
function setup(limit = 4) {
  const db = new FakeDb();
  db.t.organizations.push({ id: ORG, plan_code: 'tendi_start', name: 'Clínica Sorriso' });
  db.t.subscription_plans.push({ code: 'tendi_start', max_attendants: limit });
  db.t.profiles.push({ id: 'u-owner', full_name: 'Dona Maria', email: 'maria@x.com' }, { id: 'u-admin', full_name: 'Ana', email: 'ana@x.com' }, { id: 'u-agent', full_name: 'Beto', email: 'beto@x.com' });
  db.t.organization_memberships.push(
    { organization_id: ORG, user_id: 'u-owner', role: 'owner', status: 'active' },
    { organization_id: ORG, user_id: 'u-admin', role: 'admin', status: 'active' },
    { organization_id: ORG, user_id: 'u-agent', role: 'agent', status: 'active' },
  );
  const inviteUser = vi.fn(async (_email: string, _name: string, _context: unknown) => 'u-new');
  const resend = vi.fn(async (_email: string) => undefined);
  const isActivated = vi.fn(async (_userId: string) => true);
  const auth = { invite: inviteUser, resend, isActivated };
  return { db, inviteUser, resend, isActivated, auth };
}
const owner = { userId: 'u-owner', role: 'owner' as const };
const admin = { userId: 'u-admin', role: 'admin' as const };

describe('regras de papéis', () => {
  it('acesso por área', () => {
    expect(canAccess('agent', 'inbox')).toBe(true);
    expect(canAccess('agent', 'configuracoes')).toBe(false);
    expect(canAccess('manager', 'equipe')).toBe(true);
    expect(canAccess('manager', 'assinatura')).toBe(false);
    expect(canAccess('admin', 'assinatura')).toBe(true);
    expect(canAccess(null, 'inbox')).toBe(false);
    expect(areaForPath('/configuracoes')).toBe('configuracoes');
    expect(areaForPath('/assinatura')).toBe('assinatura');
    expect(areaForPath('/admin')).toBeNull();
  });

  it('quem pode atribuir e gerenciar quem', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'manager', 'agent']);
    expect(assignableRoles('admin')).toEqual(['manager', 'agent']);
    expect(assignableRoles('manager')).toEqual([]);
    expect(canManageMember('admin', 'admin', false)).toBe(false);
    expect(canManageMember('admin', 'agent', false)).toBe(true);
    expect(canManageMember('owner', 'owner', false)).toBe(false);
    expect(canManageMember('owner', 'admin', true)).toBe(false);
  });

  it('vagas e e-mail', () => {
    expect(checkSeats(3, 4)).toEqual({ ok: true });
    expect(checkSeats(4, 4).ok).toBe(false);
    expect(checkSeats(50, null)).toEqual({ ok: true });
    expect(normalizeEmail(' Ana@Empresa.com.br ')).toBe('ana@empresa.com.br');
    expect(normalizeEmail('ana@')).toBeNull();
  });
});

describe('operações da equipe', () => {
  it('resolveActor: Super Admin vale como dono; convite pendente não dá acesso', async () => {
    const { db } = setup();
    db.t.platform_admins.push({ user_id: 'u-super' });
    db.t.organization_memberships.push({ organization_id: ORG, user_id: 'u-pend', role: 'admin', status: 'invited' });
    expect(await resolveActor(db as any, 'u-super', ORG)).toEqual({ userId: 'u-super', role: 'owner' });
    expect(await resolveActor(db as any, 'u-admin', ORG)).toEqual({ userId: 'u-admin', role: 'admin' });
    expect(await resolveActor(db as any, 'u-pend', ORG)).toBeNull();
  });

  it('convite de pessoa nova: envia e-mail e fica pendente', async () => {
    const { db, inviteUser, auth } = setup();
    const result = await inviteMember(db as any, owner, { organizationId: ORG, email: 'Nova@X.com', fullName: 'Nova Pessoa', role: 'manager' }, auth);
    expect(result.status).toBe(200);
    expect(inviteUser).toHaveBeenCalledWith('nova@x.com', 'Nova Pessoa', { organizationName: 'Clínica Sorriso', inviterName: 'Dona', roleLabel: 'Supervisor' });
    expect(db.t.organization_memberships.at(-1)).toMatchObject({ user_id: 'u-new', role: 'manager', status: 'invited', invited_by: 'u-owner' });
  });

  it('pessoa que já tem conta entra direto, sem novo e-mail', async () => {
    const { db, inviteUser, auth } = setup(10);
    db.t.profiles.push({ id: 'u-old', email: 'velho@x.com' });
    const result = await inviteMember(db as any, owner, { organizationId: ORG, email: 'velho@x.com', fullName: 'Velho', role: 'agent' }, auth);
    expect(result.status).toBe(200);
    expect(inviteUser).not.toHaveBeenCalled();
    expect(db.t.organization_memberships.at(-1)).toMatchObject({ user_id: 'u-old', status: 'active' });
  });

  it('bloqueia: papel acima do permitido, membro repetido e limite do plano', async () => {
    const { db, inviteUser, auth } = setup();
    expect((await inviteMember(db as any, admin, { organizationId: ORG, email: 'x@x.com', fullName: 'X Y', role: 'admin' }, auth)).status).toBe(403);
    expect((await inviteMember(db as any, owner, { organizationId: ORG, email: 'x@x.com', fullName: 'X Y', role: 'owner' }, auth)).status).toBe(403);
    expect((await inviteMember(db as any, owner, { organizationId: ORG, email: 'beto@x.com', fullName: 'Beto', role: 'agent' }, auth)).status).toBe(409);
    await inviteMember(db as any, owner, { organizationId: ORG, email: 'quarto@x.com', fullName: 'Quarto', role: 'agent' }, auth);
    const full = await inviteMember(db as any, owner, { organizationId: ORG, email: 'quinto@x.com', fullName: 'Quinto', role: 'agent' }, { ...auth, invite: async () => 'u-5' });
    expect(full.status).toBe(409);
    expect(JSON.stringify(full.body)).toMatch(/até 4 usuários/);
  });

  it('setor escolhido no convite vira vínculo com o setor', async () => {
    const { db, inviteUser, auth } = setup(10);
    db.t.teams.push({ id: 't1', organization_id: ORG, name: 'Vendas' });
    await inviteMember(db as any, owner, { organizationId: ORG, email: 'n@x.com', fullName: 'Nova', role: 'agent', teamId: 't1' }, auth);
    expect(db.t.team_members.at(-1)).toMatchObject({ team_id: 't1', user_id: 'u-new', team_role: 'member' });
    expect((await inviteMember(db as any, owner, { organizationId: ORG, email: 'm@x.com', fullName: 'M', role: 'agent', teamId: 'outro' }, auth)).status).toBe(400);
  });

  it('mudar papel: admin promove atendente a supervisor, mas não mexe em outro admin nem em si', async () => {
    const { db } = setup();
    expect((await changeRole(db as any, admin, { organizationId: ORG, userId: 'u-agent', role: 'manager' })).status).toBe(200);
    expect(db.t.organization_memberships.find(m => m.user_id === 'u-agent')!.role).toBe('manager');
    expect((await changeRole(db as any, admin, { organizationId: ORG, userId: 'u-agent', role: 'admin' })).status).toBe(403);
    expect((await changeRole(db as any, admin, { organizationId: ORG, userId: 'u-admin', role: 'agent' })).status).toBe(403);
    expect((await changeRole(db as any, owner, { organizationId: ORG, userId: 'u-owner', role: 'admin' })).status).toBe(403);
  });

  it('remover: devolve conversas para a fila; dono não pode ser removido', async () => {
    const { db } = setup();
    db.t.conversations.push({ id: 'c1', organization_id: ORG, assigned_to: 'u-agent' });
    expect((await removeMember(db as any, admin, { organizationId: ORG, userId: 'u-agent' })).status).toBe(200);
    expect(db.t.organization_memberships.some(m => m.user_id === 'u-agent')).toBe(false);
    expect(db.t.conversations[0]!.assigned_to).toBeNull();
    expect((await removeMember(db as any, admin, { organizationId: ORG, userId: 'u-owner' })).status).toBe(403);
  });

  it('listMembers marca quem pode ser gerenciado e conta as vagas', async () => {
    const { db } = setup();
    const list = await listMembers(db as any, ORG, admin);
    expect(list.seats).toEqual({ used: 3, limit: 4 });
    expect(list.members.find(m => m.userId === 'u-agent')).toMatchObject({ name: 'Beto', canManage: true });
    expect(list.members.find(m => m.userId === 'u-owner')).toMatchObject({ canManage: false });
    expect(list.members.find(m => m.userId === 'u-admin')).toMatchObject({ isSelf: true, canManage: false });
  });

  it('activateInvitations ativa só os convites pendentes da pessoa', async () => {
    const { db } = setup();
    db.t.organization_memberships.push({ organization_id: ORG, user_id: 'u-new', role: 'agent', status: 'invited' }, { organization_id: 'org2', user_id: 'u-new', role: 'agent', status: 'invited' });
    expect(await activateInvitations(db as any, 'u-new')).toBe(2);
    expect(db.t.organization_memberships.filter(m => m.user_id === 'u-new').every(m => m.status === 'active')).toBe(true);
  });
});


describe('convite: reenvio e contas nunca ativadas', () => {
  it('conta que existe mas nunca entrou recebe novo link e fica pendente (não "entra com a senha de sempre")', async () => {
    const { db, auth, resend, inviteUser, isActivated } = setup(10);
    db.t.profiles.push({ id: 'u-old', email: 'nunca@x.com' });
    isActivated.mockResolvedValueOnce(false);
    const result = await inviteMember(db as any, owner, { organizationId: ORG, email: 'nunca@x.com', fullName: 'Nunca Entrou', role: 'agent' }, auth);
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).toMatch(/novo link/);
    expect(resend).toHaveBeenCalledWith('nunca@x.com');
    expect(inviteUser).not.toHaveBeenCalled();
    expect(db.t.organization_memberships.at(-1)).toMatchObject({ user_id: 'u-old', status: 'invited' });
  });

  it('reenviar convite: só para pendentes e só por quem pode gerenciar', async () => {
    const { db, auth, resend } = setup(10);
    db.t.profiles.push({ id: 'u-pend', email: 'pend@x.com' });
    db.t.organization_memberships.push({ organization_id: ORG, user_id: 'u-pend', role: 'agent', status: 'invited' });
    expect((await resendInvite(db as any, admin, { organizationId: ORG, userId: 'u-pend' }, auth)).status).toBe(200);
    expect(resend).toHaveBeenCalledWith('pend@x.com');
    expect((await resendInvite(db as any, admin, { organizationId: ORG, userId: 'u-agent' }, auth)).status).toBe(409);
    expect((await resendInvite(db as any, { userId: 'u-agent', role: 'agent' }, { organizationId: ORG, userId: 'u-pend' }, auth)).status).toBe(403);
  });

  it('limite de e-mails do Supabase vira mensagem amigável', async () => {
    const { db, auth } = setup(10);
    const result = await inviteMember(db as any, owner, { organizationId: ORG, email: 'z@x.com', fullName: 'Zé', role: 'agent' }, { ...auth, invite: async () => { throw new Error('email rate limit exceeded'); } });
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).toMatch(/Muitos e-mails/);
  });
});
