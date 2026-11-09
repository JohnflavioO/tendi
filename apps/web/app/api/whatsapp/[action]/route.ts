import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { dapiRequest, normalizeDapiStatus, type DapiSession } from '@/lib/dapi';

type Context = { params: { action: string } };
type Connection = { id: string; organization_id: string; provider_account_id: string | null; settings: Record<string, unknown> | null; status: string; display_name: string };

async function workspaceContext(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };
  const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) return { response: NextResponse.json({ error: 'Workspace não informado.' }, { status: 400 }) };

  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !membership) return { response: NextResponse.json({ error: 'Você não tem acesso a este workspace.' }, { status: 403 }) };

  const { data: connection, error: connectionError } = await supabase
    .from('channel_connections')
    .select('id,organization_id,provider_account_id,settings,status,display_name')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .maybeSingle();
  if (connectionError) return { response: NextResponse.json({ error: 'Não foi possível consultar a conexão.' }, { status: 500 }) };
  return { supabase, organizationId, connection: connection as Connection | null };
}

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await workspaceContext(request);
    if ('response' in context) return context.response;
    const { supabase, organizationId, connection } = context;

    if (params.action === 'connect') {
      if (connection?.provider_account_id) {
        const current = await dapiRequest<DapiSession>(`/sessions/${encodeURIComponent(connection.provider_account_id)}`);
        const status = normalizeDapiStatus(current.status);
        if (status === 'connected') return NextResponse.json({ status, displayName: connection.display_name });
        const qr = await dapiRequest<Record<string, unknown>>(`/sessions/${encodeURIComponent(connection.provider_account_id)}/qr`);
        return NextResponse.json({ status, qrCode: qr.qrCode ?? null, qrCodeImage: qr.qrCodeImage ?? null, qrCodeUpdatedAt: qr.qrCodeUpdatedAt ?? null });
      }

      const sessionId = `tendi_${randomUUID().replaceAll('-', '')}`;
      await dapiRequest('/sessions', {
        method: 'POST',
        body: JSON.stringify({ sessionId, type: 'unofficial', provider: 'whatsmeow', connectionMode: 'qr', webhookMode: 'normalized' }),
      });
      const { data: organization } = await supabase.from('organizations').select('name').eq('id', organizationId).single();
      const { data: saved, error } = await supabase.from('channel_connections').insert({
        organization_id: organizationId,
        channel: 'whatsapp',
        display_name: 'WhatsApp · aguardando leitura do QR Code',
        status: 'pending',
        provider_account_id: sessionId,
        settings: { provider: 'd-api', session_type: 'unofficial', connection_mode: 'qr' },
      }).select('id').single();
      if (error || !saved) {
        await dapiRequest(`/sessions/${encodeURIComponent(sessionId)}/disconnect`, { method: 'POST' }).catch(() => undefined);
        return NextResponse.json({ error: 'A sessão foi criada, mas não foi possível vinculá-la ao workspace.' }, { status: 500 });
      }
      const qr = await dapiRequest<Record<string, unknown>>(`/sessions/${encodeURIComponent(sessionId)}/qr`);
      return NextResponse.json({ status: normalizeDapiStatus(qr.status), qrCode: qr.qrCode ?? null, qrCodeImage: qr.qrCodeImage ?? null, qrCodeUpdatedAt: qr.qrCodeUpdatedAt ?? null, workspace: organization?.name ?? null });
    }

    if (params.action === 'disconnect') {
      if (!connection?.provider_account_id) return NextResponse.json({ error: 'Não há sessão WhatsApp vinculada.' }, { status: 404 });
      await dapiRequest(`/sessions/${encodeURIComponent(connection.provider_account_id)}/disconnect`, { method: 'POST' });
      const { error } = await supabase.from('channel_connections').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('id', connection.id).eq('organization_id', organizationId);
      if (error) return NextResponse.json({ error: 'WhatsApp desconectado no provedor, mas o status local não foi atualizado.' }, { status: 500 });
      return NextResponse.json({ status: 'disconnected' });
    }
    return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao comunicar com a D-API.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request, { params }: Context) {
  try {
    const context = await workspaceContext(request);
    if ('response' in context) return context.response;
    const { supabase, organizationId, connection } = context;
    if (!connection?.provider_account_id) return NextResponse.json({ status: 'disconnected' });

    if (params.action === 'qr') {
      const qr = await dapiRequest<Record<string, unknown>>(`/sessions/${encodeURIComponent(connection.provider_account_id)}/qr`);
      return NextResponse.json({ status: normalizeDapiStatus(qr.status), qrCode: qr.qrCode ?? null, qrCodeImage: qr.qrCodeImage ?? null, qrCodeUpdatedAt: qr.qrCodeUpdatedAt ?? null });
    }
    if (params.action === 'status') {
      const session = await dapiRequest<DapiSession>(`/sessions/${encodeURIComponent(connection.provider_account_id)}`);
      const status = normalizeDapiStatus(session.status);
      const displayName = typeof session.phone === 'string' ? session.phone : typeof session.phoneNumber === 'string' ? session.phoneNumber : connection.display_name;
      await supabase.from('channel_connections').update({ status, display_name: displayName, updated_at: new Date().toISOString() }).eq('id', connection.id).eq('organization_id', organizationId);
      return NextResponse.json({ status, displayName });
    }
    return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar a D-API.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
