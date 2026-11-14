import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { DapiError, dapiWebhookBaseUrl, repointDapiSessionWebhook } from '@/lib/dapi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Connection = { organization_id: string; provider_account_id: string; status: string; organizations: { name: string } | null };

async function sessions(admin: Extract<Awaited<ReturnType<typeof requireSuperAdmin>>, { ok: true }>['admin']) {
  const { data } = await admin.from('channel_connections')
    .select('organization_id,provider_account_id,status,organizations(name)')
    .eq('channel', 'whatsapp')
    .not('provider_account_id', 'is', null);
  return (data ?? []) as unknown as Connection[];
}

/** GET  /api/admin/whatsapp/webhooks -> para onde os webhooks apontam e quantas sessões existem */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const list = await sessions(auth.admin);
  return NextResponse.json({ baseUrl: dapiWebhookBaseUrl(), sessions: list.length, connected: list.filter(item => item.status === 'connected').length });
}

/**
 * POST /api/admin/whatsapp/webhooks -> aponta todas as sessões da D-API para o webhook atual
 * (usado na troca de domínio). Não desconecta nenhum WhatsApp.
 */
export async function POST() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const baseUrl = dapiWebhookBaseUrl();
  if (!baseUrl) return NextResponse.json({ error: 'DAPI_WEBHOOK_BASE_URL não está configurada na Vercel.' }, { status: 503 });

  const results: Array<{ organization: string; ok: boolean; error?: string }> = [];
  for (const connection of await sessions(auth.admin)) {
    const organization = connection.organizations?.name ?? connection.organization_id;
    try {
      await repointDapiSessionWebhook(connection.provider_account_id);
      results.push({ organization, ok: true });
    } catch (error) {
      const message = error instanceof DapiError && error.status === 404 ? 'Sessão não existe mais na D-API (reconecte pelo QR Code).' : error instanceof Error ? error.message.slice(0, 160) : 'Falha';
      results.push({ organization, ok: false, error: message });
    }
  }
  return NextResponse.json({ baseUrl, results });
}
