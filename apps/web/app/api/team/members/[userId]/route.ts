import { NextResponse } from 'next/server';
import { isUuid, teamContext } from '@/lib/team-route';
import { changeRole, removeMember } from '@/lib/team-server';

export const dynamic = 'force-dynamic';

type Context = { params: { userId: string } };

/** PATCH /api/team/members/<userId> { organizationId, role } -> muda o papel */
export async function PATCH(request: Request, { params }: Context) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ctx = await teamContext(body?.organizationId);
  if (!ctx.ok) return ctx.response;
  if (!isUuid(params.userId)) return NextResponse.json({ error: 'Membro inválido.' }, { status: 400 });
  const outcome = await changeRole(ctx.admin, ctx.actor, { organizationId: ctx.organizationId, userId: params.userId, role: body?.role });
  return NextResponse.json(outcome.body, { status: outcome.status });
}

/** DELETE /api/team/members/<userId>?organization=<id> -> remove da equipe (ou cancela o convite) */
export async function DELETE(request: Request, { params }: Context) {
  const ctx = await teamContext(new URL(request.url).searchParams.get('organization'));
  if (!ctx.ok) return ctx.response;
  if (!isUuid(params.userId)) return NextResponse.json({ error: 'Membro inválido.' }, { status: 400 });
  const outcome = await removeMember(ctx.admin, ctx.actor, { organizationId: ctx.organizationId, userId: params.userId });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
