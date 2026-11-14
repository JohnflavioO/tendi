import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/meta/disconnect   { connectionId } */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
  if (!UUID_RE.test(connectionId)) return NextResponse.json({ error: 'Conexão inválida.' }, { status: 400 });

  // A leitura com o cliente do usuário já garante que a conexão é da empresa dele.
  const { data: connection } = await (supabase as any).from('channel_connections').select('id,organization_id,channel').eq('id', connectionId).in('channel', ['instagram', 'messenger']).maybeSingle();
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada.' }, { status: 404 });
  const { data: membership } = await (supabase as any).from('organization_memberships').select('role').eq('organization_id', connection.organization_id).eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Somente o dono ou um administrador pode desconectar.' }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });
  await admin.rpc('set_channel_secret', { p_connection_id: connectionId, p_value: '' });
  const { error } = await admin.from('channel_connections').update({ status: 'disconnected' }).eq('id', connectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
