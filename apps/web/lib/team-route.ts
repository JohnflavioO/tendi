import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveActor, type Actor } from '@/lib/team-server';
import { canAccess } from '@/lib/team';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Identifica quem chama as rotas /api/team e exige pelo menos acesso à área Equipe (supervisor ou acima). */
export async function teamContext(organizationId: unknown): Promise<{ ok: true; actor: Actor; admin: Admin; organizationId: string } | { ok: false; response: NextResponse }> {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { ok: false, response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };
  if (!isUuid(organizationId)) return { ok: false, response: NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 }) };
  const actor = await resolveActor(supabase, auth.user.id, organizationId);
  if (!actor || !canAccess(actor.role, 'equipe')) {
    return { ok: false, response: NextResponse.json({ error: 'Você não tem acesso à equipe desta empresa.' }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, response: NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 }) };
  return { ok: true, actor, admin, organizationId };
}
