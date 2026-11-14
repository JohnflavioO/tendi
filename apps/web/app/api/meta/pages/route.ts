import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listMetaPages } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const TOKEN_COOKIE = 'tendi_meta_user_token';

/**
 * GET /api/meta/pages
 * Páginas que a pessoa administra no Facebook, para escolher qual conectar. Usa o token
 * temporário guardado no cookie depois do login na Meta (etapa anterior a /api/meta/connect).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const token = request.headers.get('cookie')?.match(new RegExp(`${TOKEN_COOKIE}=([^;]+)`))?.[1];
  if (!token) return NextResponse.json({ error: 'Sua sessão com a Meta expirou. Clique em "Conectar com Facebook" de novo.' }, { status: 401 });

  try {
    const pages = await listMetaPages(decodeURIComponent(token));
    return NextResponse.json({
      pages: pages.map(page => ({ id: page.id, name: page.name })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível listar as páginas.' }, { status: 502 });
  }
}
