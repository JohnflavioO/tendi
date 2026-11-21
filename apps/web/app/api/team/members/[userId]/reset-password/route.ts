import { NextResponse } from 'next/server';
import { isUuid, teamContext } from '@/lib/team-route';
import { canManageMember, isRole } from '@/lib/team';

/** Admin sends a password reset link; never sets or reveals another person's password. */
export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ctx = await teamContext(body?.organizationId);
  if (!ctx.ok) return ctx.response;
  if (!isUuid(params.userId)) return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 });
  const { data: member, error: memberError } = await ctx.admin.from('organization_memberships')
    .select('role,status').eq('organization_id', ctx.organizationId).eq('user_id', params.userId).maybeSingle();
  if (memberError || !member || !isRole(member.role) || !canManageMember(ctx.actor.role, member.role, ctx.actor.userId === params.userId))
    return NextResponse.json({ error: 'Sem permissão para redefinir a senha deste usuário.' }, { status: 403 });
  const { data: auth, error: authError } = await ctx.admin.auth.admin.getUserById(params.userId);
  if (authError || !auth.user?.email) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  const { error } = await ctx.admin.auth.resetPasswordForEmail(auth.user.email, { redirectTo: `${origin}/auth/callback` });
  if (error) {
    console.error('[Equipe] falha ao enviar redefinição de senha', error.message);
    return NextResponse.json({ error: 'Não foi possível enviar o e-mail de redefinição.' }, { status: 502 });
  }
  return NextResponse.json({ message: 'Enviamos um link de redefinição de senha para o e-mail do usuário.' });
}
