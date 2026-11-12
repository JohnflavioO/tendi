import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: { organizationId: string } }) {
  try {
    const sessionClient = await createClient();
    const { data: auth } = await sessionClient.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });

    const { data: platformAdmin } = await sessionClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (!platformAdmin) return NextResponse.json({ error: 'Apenas o Super Admin pode configurar uma empresa.' }, { status: 403 });

    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Informe nome e e-mail válidos para o administrador.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'O convite ainda não está habilitado. Configure SUPABASE_SERVICE_ROLE_KEY no ambiente da aplicação.' }, { status: 503 });
    }

    const adminClient = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: organization, error: organizationError } = await adminClient
      .from('organizations')
      .select('id,name')
      .eq('id', params.organizationId)
      .single();
    if (organizationError || !organization) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const { data: existingProfile } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existingProfile) {
      const { data: existingMembership } = await adminClient.from('organization_memberships')
        .select('id').eq('organization_id', organization.id).eq('user_id', existingProfile.id).maybeSingle();
      if (existingMembership) return NextResponse.json({ error: 'Este usuário já está vinculado a esta empresa.' }, { status: 409 });
      const { error: membershipError } = await adminClient.from('organization_memberships').insert({
        organization_id: organization.id, user_id: existingProfile.id, role: 'owner', status: 'active',
      });
      if (membershipError) throw membershipError;
      const { data: team } = await adminClient.from('teams').select('id').eq('organization_id', organization.id).limit(1).maybeSingle();
      if (team) {
        const { error: teamError } = await adminClient.from('team_members').insert({
          organization_id: organization.id, team_id: team.id, user_id: existingProfile.id, team_role: 'leader',
        });
        if (teamError && !teamError.message.toLowerCase().includes('duplicate')) throw teamError;
      }
      return NextResponse.json({ invited: false, message: 'Usuário existente vinculado como administrador.' });
    }

    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      // needs_password: o primeiro acesso leva a pessoa a criar a senha (sem isso ela não consegue entrar de novo).
      // organization_name e invite_role aparecem no e-mail de convite e na tela de boas-vindas.
      data: { full_name: fullName, needs_password: true, organization_name: organization.name, invite_role: 'administrador' },
      redirectTo: new URL('/auth/callback', request.url).toString(),
    });
    if (inviteError) throw inviteError;
    const invitedUserId = invite.user.id;

    const { error: membershipError } = await adminClient.from('organization_memberships').insert({
      organization_id: organization.id, user_id: invitedUserId, role: 'owner', status: 'active',
    });
    if (membershipError) throw membershipError;

    const { data: team } = await adminClient.from('teams').select('id').eq('organization_id', organization.id).limit(1).maybeSingle();
    if (team) {
      const { error: teamError } = await adminClient.from('team_members').insert({
        organization_id: organization.id, team_id: team.id, user_id: invitedUserId, team_role: 'leader',
      });
      if (teamError) throw teamError;
    }

    return NextResponse.json({ invited: true, message: 'Convite enviado e acesso à empresa preparado.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível configurar o administrador.' }, { status: 500 });
  }
}
