import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/team-route';

export const dynamic = 'force-dynamic';

/** Manager-authorized transfer, committed atomically by PostgreSQL. */
export async function POST(request: Request) {
  const db = (await createClient()) as any;
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth?.user) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isUuid(body?.organizationId) || !isUuid(body?.contactId) || !isUuid(body?.toUserId)) {
    return NextResponse.json({ error: 'Empresa, contato ou destinatário inválido.' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500) {
    return NextResponse.json({ error: 'Informe um motivo entre 10 e 500 caracteres.' }, { status: 400 });
  }
  // IMPORTANT: user-scoped client preserves auth.uid() in the SQL RPC.
  // Do not use the service-role client for this operation.
  const { data, error } = await db.rpc('transfer_sales_portfolio', {
    p_organization_id: body.organizationId,
    p_contact_id: body.contactId,
    p_to_user_id: body.toUserId,
    p_reason: reason,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '22023' ? 422 : 500;
    return NextResponse.json({ error: status === 500 ? 'Não foi possível transferir a carteira.' : error.message }, { status });
  }
  return NextResponse.json({ ok: true, transferId: data });
}
