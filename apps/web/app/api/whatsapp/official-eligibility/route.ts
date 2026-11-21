import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return NextResponse.json({ approved: false });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ approved: false }, { status: 401 });
  const { data: member } = await supabase.from('organization_memberships').select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).eq('status','active').maybeSingle();
  if (!member) return NextResponse.json({ approved: false }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ approved: false });
  const [{ data: org, error: orgError }, { data: approval, error: approvalError }] = await Promise.all([
    admin.from('organizations').select('plan_code').eq('id', organizationId).maybeSingle(),
    admin.from('whatsapp_official_approvals').select('approved,billing_verified').eq('organization_id', organizationId).maybeSingle(),
  ]);
  return NextResponse.json({ approved: !orgError && !approvalError && org?.plan_code === 'tendi_business' && approval?.approved === true && approval?.billing_verified === true });
}
