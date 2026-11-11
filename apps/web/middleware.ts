import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicMarketingPath } from './lib/marketing-routes';
import { isTrialExemptPath, shouldBlockAccess } from './lib/trial';

export async function middleware(request: NextRequest) {
  // Webhooks de provedores (ex.: D-API) não têm sessão de usuário. A autenticação é o segredo
  // no caminho da URL, validado dentro da própria rota. Sem esta exceção eles caem em /login (307).
  if (request.nextUrl.pathname.startsWith('/api/webhooks/')) return NextResponse.next({ request });
  // Link de confirmação que caiu na página inicial (ex.: redirect fora da lista permitida
  // do Supabase): encaminha o código para o callback, que conclui o login e o cadastro.
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')) {
    const callback = request.nextUrl.clone();
    callback.pathname = '/auth/callback';
    return NextResponse.redirect(callback);
  }
  if (isPublicMarketingPath(request.nextUrl.pathname)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: Array<{ name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname.startsWith('/login');
  const isRegister = request.nextUrl.pathname === '/register' || request.nextUrl.pathname === '/register/confirmar';
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
  if (!data.user && !isLogin && !isRegister && !isAuthRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    return NextResponse.redirect(redirect);
  }
  if (data.user && (isLogin || isRegister)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/inbox';
    return NextResponse.redirect(redirect);
  }

  // Teste vencido ou empresa suspensa: o usuário só alcança a tela de assinatura, o logout e o console admin.
  const pathname = request.nextUrl.pathname;
  if (data.user && !isTrialExemptPath(pathname)) {
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('status,trial_ends_at');
    if (!error && shouldBlockAccess(organizations ?? [])) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'O acesso ao Tendi está pausado. Assine um plano em /assinatura para continuar.' },
          { status: 402 },
        );
      }
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/assinatura';
      redirect.search = '';
      return NextResponse.redirect(redirect);
    }
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
