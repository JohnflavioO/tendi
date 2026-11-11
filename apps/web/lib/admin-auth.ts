import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Garante que quem chama a rota é o Super Admin e devolve o cliente com a chave de serviço.
 * Em caso de erro, devolve a resposta HTTP pronta.
 */
export async function requireSuperAdmin(): Promise<
  { ok: true; userId: string; admin: NonNullable<ReturnType<typeof createAdminClient>> } | { ok: false; response: NextResponse }
> {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { ok: false, response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };

  const { data: row } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 }) };

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.' }, { status: 503 }) };
  }
  return { ok: true, userId: auth.user.id, admin };
}
