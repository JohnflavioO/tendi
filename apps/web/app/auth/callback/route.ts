import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
        const { data: admin } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (admin) return NextResponse.redirect(new URL('/admin', origin));

        const organizationName = user.user_metadata?.organization_name;
        const planCode = user.user_metadata?.plan_code;

        if (typeof organizationName === 'string' && typeof planCode === 'string') {
          const { error: provisionError } = await (supabase as any).rpc('provision_customer_workspace', {
            p_organization_name: organizationName,
            p_plan_code: planCode,
          });

          if (provisionError) {
            console.error('Falha ao provisionar workspace após confirmação:', provisionError.message);
            return NextResponse.redirect(new URL('/inbox?setup=failed', origin));
          }

          return NextResponse.redirect(new URL('/inbox?welcome=1', origin));
        }

        return NextResponse.redirect(new URL('/inbox', origin));
      }
    }
  }

  return NextResponse.redirect(new URL('/login', origin));
}
