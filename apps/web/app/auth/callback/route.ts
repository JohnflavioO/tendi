import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { provisionPendingWorkspace } from '@/lib/ensure-workspace';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateInvitations } from '@/lib/team-server';
import { safeNext } from '@/lib/auth-redirect';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (user) {
        // Convite para a equipe: o primeiro acesso ativa o vínculo e leva a pessoa a criar a senha.
        const serviceClient = createAdminClient();
        if (serviceClient) {
          await activateInvitations(serviceClient, user.id).catch(err => console.error('[Equipe] convites não ativados', err instanceof Error ? err.message : err));
        }
        if (user.user_metadata?.needs_password) return NextResponse.redirect(new URL('/definir-senha', origin));
        // Destino pedido pelo próprio app (ex.: redefinição de senha); só caminhos internos.
        const next = safeNext(searchParams.get('next'));
        if (next) return NextResponse.redirect(new URL(next, origin));

        const { data: admin } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (admin) return NextResponse.redirect(new URL('/admin', origin));

        // Só cria o workspace para quem ainda não tem empresa; links de acesso
        // usados por contas já provisionadas seguem direto para a Inbox.
        const { data: organizations } = await supabase.from('organizations').select('id').limit(1);
        if (organizations && organizations.length === 0) {
          try {
            const created = await provisionPendingWorkspace(supabase as any, user);
            if (created) return NextResponse.redirect(new URL('/inbox?welcome=1', origin));
          } catch (provisionError) {
            console.error('Falha ao provisionar workspace após confirmação:', provisionError instanceof Error ? provisionError.message : provisionError);
            return NextResponse.redirect(new URL('/inbox?setup=failed', origin));
          }
        }

        return NextResponse.redirect(new URL('/inbox', origin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login', origin));
}
