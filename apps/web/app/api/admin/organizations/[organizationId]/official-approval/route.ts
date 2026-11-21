import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
type Context = { params: { organizationId: string } };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  if (!UUID_RE.test(params.organizationId)) return NextResponse.json({ error: 'Workspace inválido.' }, { status: 400 });
  const { data, error } = await auth.admin.from('whatsapp_official_approvals')
    .select('approved,billing_verified').eq('organization_id', params.organizationId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Aprovação indisponível. Confira a migration.' }, { status: 503 });
  return NextResponse.json({ approved: data?.approved === true, billingVerified: data?.billing_verified === true });
}
