import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCampaign } from '@/lib/campaigns-server';

export const dynamic = 'force-dynamic';

const MANAGER_ROLES = ['owner', 'admin', 'manager'];

/**
 * POST /api/campaigns  { organizationId, name, message, tag }
 * Cria uma campanha de marketing e já registra os destinatários (contatos do segmento com
 * opt-in de WhatsApp confirmado). O envio em si é feito pelo agendador (/api/cron/campaigns).
 * Acesso: dono, administrador ou supervisor da empresa.
 */
export async function POST(request: Request) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const organizationId = typeof input.organizationId === 'string' ? input.organizationId : '';
  const name = typeof input.name === 'string' ? input.name : '';
  const message = typeof input.message === 'string' ? input.message : '';
  const tag = typeof input.tag === 'string' ? input.tag : '';
  if (!organizationId) return NextResponse.json({ error: 'Empresa não informada.' }, { status: 400 });

  const { data: membership } = await supabase.from('organization_memberships').select('role,status')
    .eq('organization_id', organizationId).eq('user_id', auth.user.id).maybeSingle();
  if (!membership || membership.status !== 'active' || !MANAGER_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Só o dono, administrador ou supervisor pode criar campanhas.' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const result = await createCampaign(admin, { organizationId, name, message, tag, createdBy: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, campaignId: result.campaignId, totalRecipients: result.totalRecipients });
}
