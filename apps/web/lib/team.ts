/**
 * Papéis da equipe no workspace e o que cada um pode fazer. Funções puras (servidor e páginas).
 *
 *  Dono (owner)          tudo, inclusive assinatura e administradores
 *  Administrador (admin) equipe (supervisores e atendentes), WhatsApp, configurações
 *  Supervisor (manager)  setores, funil do CRM, relatórios; vê a equipe
 *  Atendente (agent)     Inbox, contatos e CRM
 *
 * O Super Admin da plataforma é tratado como dono em qualquer empresa.
 */

export const ROLES = ['owner', 'admin', 'manager', 'agent'] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: 'Dono', description: 'Acesso total, assinatura e administradores.' },
  admin: { label: 'Administrador', description: 'Gerencia a equipe, o WhatsApp e as configurações.' },
  manager: { label: 'Supervisor', description: 'Acompanha a equipe, organiza setores, funil e relatórios.' },
  agent: { label: 'Atendente', description: 'Atende no Inbox e cuida de contatos e oportunidades.' },
};

export type Area = 'inbox' | 'agenda' | 'crm' | 'contatos' | 'chatbots' | 'relatorios' | 'configuracoes' | 'equipe' | 'assinatura' | 'ia';

const AREA_MIN_ROLE: Record<Area, Role> = {
  inbox: 'agent',
  agenda: 'agent',
  crm: 'agent',
  contatos: 'agent',
  relatorios: 'manager',
  chatbots: 'manager',
  configuracoes: 'manager',
  equipe: 'manager',
  assinatura: 'admin',
  ia: 'admin',
};

const RANK: Record<Role, number> = { owner: 4, admin: 3, manager: 2, agent: 1 };

export function canAccess(role: Role | null | undefined, area: Area): boolean {
  return Boolean(role) && RANK[role as Role] >= RANK[AREA_MIN_ROLE[area]];
}

/**
 * Áreas que o Super Admin da plataforma abre numa empresa da qual NÃO é membro: só a configuração
 * da conta. Inbox, CRM, contatos e relatórios ficam fora, por confidencialidade dos atendimentos
 * (o banco também bloqueia esses dados para ele).
 */
export const SUPER_ADMIN_AREAS: readonly Area[] = ['chatbots', 'configuracoes', 'equipe', 'assinatura', 'ia'];

/** Acesso a uma área: pelo papel na empresa ou, para o Super Admin, só nas áreas de configuração. */
export function canAccessArea(role: Role | null | undefined, superAdmin: boolean, area: Area): boolean {
  return canAccess(role, area) || (superAdmin && SUPER_ADMIN_AREAS.includes(area));
}

/** Área da rota (/crm/... -> crm). null = rota sem controle por papel. */
export function areaForPath(pathname: string): Area | null {
  const first = pathname.split('/')[1] ?? '';
  return (Object.keys(AREA_MIN_ROLE) as Area[]).find(area => area === first) ?? null;
}

/** Papéis que quem convida pode atribuir. Ninguém cria outro dono por convite. */
export function assignableRoles(actor: Role | null | undefined): Role[] {
  if (actor === 'owner') return ['admin', 'manager', 'agent'];
  if (actor === 'admin') return ['manager', 'agent'];
  return [];
}

/** Pode alterar ou remover este membro? Nunca a si mesmo, nunca um dono, só papéis abaixo do seu. */
export function canManageMember(actor: Role | null | undefined, target: Role, isSelf: boolean): boolean {
  if (isSelf || target === 'owner') return false;
  return assignableRoles(actor).includes(target);
}

export type SeatCheck = { ok: true } | { ok: false; error: string };

/** Usuários contam convidados e ativos. limit null = sem limite. */
export function checkSeats(used: number, limit: number | null | undefined): SeatCheck {
  if (!limit || used < limit) return { ok: true };
  return { ok: false, error: `Seu plano permite até ${limit} usuários e todos estão em uso. Remova alguém ou mude de plano para convidar mais pessoas.` };
}

export function normalizeEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}
