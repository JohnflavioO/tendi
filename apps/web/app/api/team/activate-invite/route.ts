import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateInvitations } from '@/lib/team-server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
  try {
    await activateInvitations(admin, user.id);
    return NextResponse.json({ ok: true, needsPassword: Boolean(user.user_metadata?.needs_password) });
  } catch (error) {
    console.error('[Equipe] falha ao ativar convite autenticado', error);
    return NextResponse.json({ error: 'Não foi possível ativar o convite.' }, { status: 500 });
  }
}
