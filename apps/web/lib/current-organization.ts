/**
 * Empresa atual do usuário nas telas do workspace.
 *
 * Quem enxerga o cadastro de várias empresas (o Super Admin) só TRABALHA naquelas em que tem
 * vínculo ativo ou um acesso de suporte liberado pelo cliente. Estas funções separam as duas coisas
 * e escolhem a empresa da tela: a pedida em ?organization=, senão a primeira em que a pessoa tem acesso.
 */

type Db = { from: (table: string) => any };

export type SupportSession = { organizationId: string; expiresAt: string };

/** Empresas em que a pessoa tem vínculo ativo. */
export async function memberOrganizationIds(db: Db, userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('organization_memberships').select('organization_id').eq('user_id', userId).eq('status', 'active');
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ organization_id: string }>).map(row => row.organization_id));
}

/** Acessos de suporte em andamento (código do cliente já usado, dentro do prazo e não encerrado). */
export async function activeSupportSessions(db: Db, userId: string, now: Date = new Date()): Promise<SupportSession[]> {
  const { data, error } = await db.from('support_access_grants')
    .select('organization_id,access_expires_at')
    .eq('redeemed_by', userId).is('ended_at', null).gt('access_expires_at', now.toISOString());
  // Banco ainda sem a tabela de suporte: segue como se não houvesse acesso de suporte.
  if (error) return [];
  return ((data ?? []) as Array<{ organization_id: string; access_expires_at: string }>)
    .map(row => ({ organizationId: row.organization_id, expiresAt: row.access_expires_at }));
}

/** Escolhe a empresa da tela. Regra pura, para poder ser testada. */
export function pickOrganization<T extends { id: string }>(visible: T[], accessibleIds: Set<string>, requestedId: string | null | undefined): T | null {
  const requested = requestedId ? visible.find(org => org.id === requestedId) : undefined;
  return requested ?? visible.find(org => accessibleIds.has(org.id)) ?? visible[0] ?? null;
}

export type CurrentOrganization<T> = { organization: T | null; accessible: T[]; support: SupportSession[] };

/**
 * Empresa da tela e lista das empresas em que a pessoa pode trabalhar.
 * `columns` são as colunas de organizations que a tela precisa (sempre inclua "id").
 */
export async function resolveCurrentOrganization<T extends { id: string }>(db: Db, userId: string, columns: string, requestedId?: string | null): Promise<CurrentOrganization<T>> {
  const [orgs, members, support] = await Promise.all([
    db.from('organizations').select(columns).order('name'),
    memberOrganizationIds(db, userId),
    activeSupportSessions(db, userId),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);
  const visible = (orgs.data ?? []) as T[];
  const accessibleIds = new Set([...members, ...support.map(session => session.organizationId)]);
  return {
    organization: pickOrganization(visible, accessibleIds, requestedId),
    accessible: visible.filter(org => accessibleIds.has(org.id)),
    support,
  };
}

export const requestedOrganizationId = (): string | null =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('organization');

/** Acrescenta ?organization=<id> a um link do workspace, para a tela seguinte abrir a mesma empresa. */
export function withOrganization(href: string, organizationId: string | null | undefined): string {
  if (!organizationId) return href;
  return `${href}${href.includes('?') ? '&' : '?'}organization=${organizationId}`;
}
