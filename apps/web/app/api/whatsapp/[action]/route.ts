import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildCreateSessionPayload,
  buildDapiWebhookUrl,
  dapiRequest,
  normalizeDapiStatus,
  type DapiSession,
} from '@/lib/dapi';

type Context = { params: { action: string } };
type Connection = {
  id: string;
  organization_id: string;
  provider_account_id: string | null;
  settings: Record<string, unknown> | null;
  status: string;
  display_name: string;
};

async function workspaceContext(request: Request) {
  const supabase = (await createClient()) as any;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };
  }

  const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) {
    return { response: NextResponse.json({ error: 'Workspace não informado.' }, { status: 400 }) };
  }

  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !membership) {
    return {
      response: NextResponse.json(
        { error: 'Você não tem acesso a este workspace.' },
        { status: 403 },
      ),
    };
  }

  const { data: connection, error: connectionError } = await supabase
    .from('channel_connections')
    .select('id,organization_id,provider_account_id,settings,status,display_name')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (connectionError) {
    return {
      response: NextResponse.json(
        { error: 'Não foi possível consultar a conexão.' },
        { status: 500 },
      ),
    };
  }

  return {
    supabase,
    organizationId,
    connection: connection as Connection | null,
  };
}

function stableSessionId(organizationId: string): string {
  const safeOrganizationId = organizationId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `tendi-${safeOrganizationId}`;
}

async function persistSessionId(
  supabase: any,
  organizationId: string,
  connection: Connection | null,
  sessionId: string,
): Promise<{ connectionId: string } | { response: Response }> {
  if (connection) {
    if (connection.provider_account_id) return { connectionId: connection.id };

    const { data, error } = await supabase
      .from('channel_connections')
      .update({
        provider_account_id: sessionId,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('organization_id', organizationId)
      .select('id')
      .single();

    if (error || !data) {
      return {
        response: NextResponse.json(
          { error: 'Não foi possível salvar o identificador da sessão.' },
          { status: 500 },
        ),
      };
    }
    return { connectionId: data.id };
  }

  const { data, error } = await supabase
    .from('channel_connections')
    .insert({
      organization_id: organizationId,
      channel: 'whatsapp',
      display_name: 'WhatsApp · aguardando leitura do QR Code',
      status: 'pending',
      provider_account_id: sessionId,
      settings: { provider: 'd-api', session_type: 'unofficial', connection_mode: 'qr' },
    })
    .select('id')
    .single();

  if (error || !data) {
    return {
      response: NextResponse.json(
        { error: 'Não foi possível reservar a sessão para este workspace.' },
        { status: 500 },
      ),
    };
  }
  return { connectionId: data.id };
}

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await workspaceContext(request);
    if ('response' in context) return context.response;
    const { supabase, organizationId, connection } = context;

    if (params.action === 'connect') {
      const webhookUrl = buildDapiWebhookUrl(new URL(request.url).origin);
      const sessionId = connection?.provider_account_id || stableSessionId(organizationId);

      // Persist the stable session identifier before provisioning it at D-API.
      const persisted = await persistSessionId(
        supabase,
        organizationId,
        connection,
        sessionId,
      );
      if ('response' in persisted) return persisted.response;

      await dapiRequest('/sessions', {
        method: 'POST',
        body: JSON.stringify(buildCreateSessionPayload(sessionId, webhookUrl)),
      });

      await supabase
        .from('channel_connections')
        .update({
          status: 'pending',
          display_name: 'WhatsApp · sessão criada, aguardando conexão',
          settings: {
            provider: 'd-api',
            session_type: 'unofficial',
            connection_mode: 'qr',
            webhook_configured: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', persisted.connectionId)
        .eq('organization_id', organizationId);

      return NextResponse.json({
        success: true,
        sessionId,
        status: 'pending',
        message: 'Sessão criada na D-API. A próxima etapa habilitará a leitura e atualização do QR Code.',
      });
    }

    if (params.action === 'disconnect') {
      if (!connection?.provider_account_id) {
        return NextResponse.json(
          { error: 'Não há sessão WhatsApp vinculada.' },
          { status: 404 },
        );
      }
      await dapiRequest(
        `/sessions/${encodeURIComponent(connection.provider_account_id)}/disconnect`,
        { method: 'POST' },
      );
      const { error } = await supabase
        .from('channel_connections')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('id', connection.id)
        .eq('organization_id', organizationId);
      if (error) {
        return NextResponse.json(
          { error: 'WhatsApp desconectado no provedor, mas o status local não foi atualizado.' },
          { status: 500 },
        );
      }
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

    if (!connection?.provider_account_id) {
      return NextResponse.json({ status: 'disconnected' });
    }

    if (params.action === 'qr') {
      const qr = await dapiRequest<Record<string, unknown>>(
        `/sessions/${encodeURIComponent(connection.provider_account_id)}/qr`,
      );
      return NextResponse.json({
        status: normalizeDapiStatus(qr.status),
        qrCode: qr.qrCode ?? null,
        qrCodeImage: qr.qrCodeImage ?? null,
        qrCodeUpdatedAt: qr.qrCodeUpdatedAt ?? null,
      });
    }

    if (params.action === 'status') {
      const session = await dapiRequest<DapiSession>(
        `/sessions/${encodeURIComponent(connection.provider_account_id)}`,
      );
      const status = normalizeDapiStatus(session.status);
      const displayName =
        typeof session.phone === 'string'
          ? session.phone
          : typeof session.phoneNumber === 'string'
            ? session.phoneNumber
            : connection.display_name;

      await supabase
        .from('channel_connections')
        .update({ status, display_name: displayName, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
        .eq('organization_id', organizationId);

      return NextResponse.json({ status, displayName });
    }

    return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar a D-API.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
