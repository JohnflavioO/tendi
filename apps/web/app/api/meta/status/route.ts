import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMetaConfigured } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

/** GET /api/meta/status — a tela de Conexões usa isto para saber se já dá para oferecer "Conectar com Facebook". */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  return NextResponse.json({ configured: isMetaConfigured() });
}
