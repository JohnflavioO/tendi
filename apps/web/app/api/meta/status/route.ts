import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isInstagramConfigured, isMessengerConfigured } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meta/status — a tela de Conexões usa isto para saber se já dá para oferecer
 * "Conectar com Facebook" (Messenger) e "Conectar Instagram". São credenciais diferentes, então
 * um pode estar pronto antes do outro.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  return NextResponse.json({ messengerConfigured: isMessengerConfigured(), instagramConfigured: isInstagramConfigured() });
}
