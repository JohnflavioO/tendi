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
      if (userData.user) {
        const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
        return NextResponse.redirect(new URL(admin ? '/admin' : '/inbox', origin));
      }
    }
  }
  return NextResponse.redirect(new URL('/login', origin));
}
