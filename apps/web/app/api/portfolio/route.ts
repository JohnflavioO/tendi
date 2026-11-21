import { NextResponse } from 'next/server';
import { teamContext } from '@/lib/team-route';

export const dynamic = 'force-dynamic';

/** Read-only management overview; access is checked before using service-role. */
export async function GET(request: Request) {
  const ctx = await teamContext(new URL(request.url).searchParams.get('organization'));
  if (!ctx.ok) return ctx.response;
  const { admin, organizationId, actor } = ctx;
  // Platform administrators without an active tenant membership cannot inspect portfolios.
  const { data: tenantMembership, error: tenantError } = await admin.from('organization_memberships')
    .select('role').eq('organization_id', organizationId).eq('user_id', actor.userId).eq('status', 'active').maybeSingle();
  if (tenantError || !tenantMembership || !['owner', 'admin', 'manager'].includes(tenantMembership.role)) {
    return NextResponse.json({ error: 'Acesso restrito aos gestores desta empresa.' }, { status: 403 });
  }
  // Only active, authorized managers are allowed. No cross-tenant access.
  const [{ data: settings, error: settingsError }, { data: members, error: membersError }, { data: contacts, error: contactsError }, { data: transfers, error: transfersError }] = await Promise.all([
    admin.from('sales_portfolio_settings').select('private_mode_enabled,authorized_transfers').eq('organization_id', organizationId).maybeSingle(),
    admin.from('organization_memberships').select('user_id,role,status').eq('organization_id', organizationId).eq('status', 'active'),
    admin.from('contacts').select('id,full_name,owner_id,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500),
    admin.from('sales_portfolio_transfers').select('id,contact_id,from_user_id,to_user_id,authorized_by,reason,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (settingsError || membersError || contactsError || transfersError) {
    return NextResponse.json({ error: 'Não foi possível carregar as carteiras. Verifique as migrações.' }, { status: 503 });
  }
  const activeMembers = members ?? [];
  const ids = activeMembers.map(member => member.user_id);
  const { data: profiles, error: profilesError } = ids.length
    ? await admin.from('profiles').select('id,full_name,email').in('id', ids)
    : { data: [], error: null };
  if (profilesError) return NextResponse.json({ error: 'Não foi possível consultar a equipe.' }, { status: 503 });
  const names = new Map((profiles ?? []).map(p => [p.id, p.full_name || p.email || 'Usuário']));
  const visibleContacts = contacts ?? [];
  const counts = activeMembers.map(m => ({
    userId: m.user_id, name: names.get(m.user_id) || 'Usuário', role: m.role,
    count: visibleContacts.filter(c => c.owner_id === m.user_id).length,
  }));
  return NextResponse.json({
    privateModeEnabled: settings?.private_mode_enabled ?? false,
    transfersEnabled: settings?.authorized_transfers ?? false,
    actorRole: actor.role,
    // Pagination is intentionally capped; do not mislabel the sample as full totals.
    contacts: visibleContacts,
    contactsCapped: visibleContacts.length === 500,
    members: counts,
    transfers: transfers ?? [],
  });
}
