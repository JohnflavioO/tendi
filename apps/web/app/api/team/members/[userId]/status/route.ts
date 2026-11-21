import { NextResponse } from 'next/server';
import { isUuid, teamContext } from '@/lib/team-route';
import { canManageMember, isRole } from '@/lib/team';

export const dynamic = 'force-dynamic';
type Context = { params: { userId: string } };

/** Suspends or reactivates membership in one organization, never the global Auth account. */
export async function PATCH(request: Request, { params }: Context) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ctx = await teamContext(body?.organizationId);
  if (!ctx.ok) return ctx.response;
  if (!isUuid(params.userId) || (body?.status !== 'suspended' && body?.status !== 'active'))
    return NextResponse.json({ error: 'Usuário ou situação inválida.' }, { status: 400 });
  if (params.userId === ctx.actor.userId)
    return NextResponse.json({ error: 'Você não pode bloquear sua própria conta.' }, { status: 403 });
  const { data: member, error: readError } = await ctx.admin.from('organization_memberships')
    .select('role,status').eq('organization_id', ctx.organizationId).eq('user_id', params.userId).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Falha ao consultar membro.' }, { status: 500 });
  if (!member || !isRole(member.role)) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
  if (!canManageMember(ctx.actor.role, member.role, false))
    return NextResponse.json({ error: 'Você não tem permissão para bloquear este membro.' }, { status: 403 });
  if (!['active','suspended'].includes(member.status))
    return NextResponse.json({ error: 'Convites pendentes não podem ser bloqueados.' }, { status: 409 });
  if (member.status === body.status) return NextResponse.json({ ok: true, status: member.status });
  // Do not delete conversations, contacts or opportunities: status-aware RLS immediately
  // removes this member's access while retaining all history for later reactivation.
  const { data: updated, error } = await ctx.admin.from('organization_memberships')
    .update({ status: body.status }).eq('organization_id', ctx.organizationId)
    .eq('user_id', params.userId).eq('status', member.status).select('user_id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar o acesso.' }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Situação alterada por outra operação. Atualize a página.' }, { status: 409 });
  return NextResponse.json({ ok: true, status: body.status });
}
