import { NextResponse } from 'next/server';
import { isUuid, teamContext } from '@/lib/team-route';
import { resendInvite } from '@/lib/team-server';
import { teamAuthOps } from '@/lib/team-auth';

export const dynamic = 'force-dynamic';

/** POST /api/team/members/<userId>/resend { organizationId } -> reenvia o convite de quem ainda não entrou */
export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ctx = await teamContext(body?.organizationId);
  if (!ctx.ok) return ctx.response;
  if (!isUuid(params.userId)) return NextResponse.json({ error: 'Membro inválido.' }, { status: 400 });
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  const outcome = await resendInvite(ctx.admin, ctx.actor, { organizationId: ctx.organizationId, userId: params.userId }, teamAuthOps(ctx.admin, origin));
  return NextResponse.json(outcome.body, { status: outcome.status });
}
