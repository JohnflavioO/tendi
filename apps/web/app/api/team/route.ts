import { NextResponse } from 'next/server';
import { teamContext } from '@/lib/team-route';
import { inviteMember, listMembers } from '@/lib/team-server';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/team?organization=<id>                                -> membros, papéis e vagas do plano
 * POST /api/team { organizationId, fullName, email, role, teamId? } -> convida para a equipe
 */
export async function GET(request: Request) {
  const ctx = await teamContext(new URL(request.url).searchParams.get('organization'));
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listMembers(ctx.admin, ctx.organizationId, ctx.actor));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ctx = await teamContext(body?.organizationId);
  if (!ctx.ok) return ctx.response;

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  const outcome = await inviteMember(ctx.admin, ctx.actor, {
    organizationId: ctx.organizationId,
    email: body?.email,
    fullName: body?.fullName,
    role: body?.role,
    teamId: body?.teamId,
  }, async (email, fullName) => {
    const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(email, {
      // needs_password: o primeiro acesso leva a pessoa a criar a senha.
      data: { full_name: fullName, needs_password: true },
      redirectTo: `${origin}/auth/callback`,
    });
    if (error || !data?.user?.id) throw error ?? new Error('Convite sem usuário.');
    return data.user.id;
  });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
