import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildCreateSessionPayload,
  buildDapiWebhookUrl,
  getDapiApiKey,
  dapiRequest,
  normalizeDapiStatus,
  unwrapDapiResource,
  extractDapiConnectionStatus,
  DapiError,
} from '@/lib/dapi';

type Context = { params: { action: string } };
type Connection = {
  id: string;
  organization_id: string;
  provider_account_id: string | null;
  settings: Record<string, unknown> | null;
  status: string;
  display_name: string;
  updated_at: string | null;
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

  if (error) {
    return {
      response: NextResponse.json(
        { error: 'Não foi possível validar o vínculo com este workspace.' },
        { status: 500 },
      ),
    };
  }

  // Platform Super Admins can manage customer workspaces without a tenant membership.
  if (!membership) {
    const { data: platformAdmin, error: platformAdminError } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (platformAdminError || !platformAdmin) {
      return {
        response: NextResponse.json(
          { error: 'Você não tem acesso a este workspace.' },
          { status: 403 },
        ),
      };
    }
  }

  const { data: connection, error: connectionError } = await supabase
    .from('channel_connections')
    .select('id,organization_id,provider_account_id,settings,status,display_name,updated_at')
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

async function createOrRecoverDapiSession(sessionId: string, webhookUrl: string): Promise<'created' | 'recovered'> {
  const sessionPath = `/sessions/${encodeURIComponent(sessionId)}`;
  const createSession = () => dapiRequest<Record<string, unknown>>('/sessions', {
    method: 'POST',
    body: JSON.stringify(buildCreateSessionPayload(sessionId, webhookUrl)),
  }, {
    onResponse: (httpStatus, payload) => {
      const root = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      console.log('[D-API create session]', {
        sessionId,
        httpStatus,
        responseKeys: Object.keys(root),
        providerError: typeof root.error === 'string' ? root.error : undefined,
        code: typeof root.code === 'string' || typeof root.code === 'number' ? root.code : undefined,
        details: safeDapiDetails(root.details),
      });
    },
  });

  try {
    await createSession();
    return 'created';
  } catch (createError) {
    const details = createError instanceof DapiError
      ? safeDapiDetails(createError.details) ?? ''
      : '';
    const duplicate = /duplicate key value violates unique constraint ["']?sessions_session_id_key/i
      .test(details);
    if (!duplicate) throw createError;

    console.warn('[D-API duplicate session id; checking existing session]', {
      sessionId,
      details,
    });

    try {
      await dapiRequest(`${sessionPath}/connect`, { method: 'GET' });
      return 'recovered';
    } catch (reconnectError) {
      const missing = reconnectError instanceof DapiError &&
        (reconnectError.status === 404 || reconnectError.code === 404) &&
        /session not found/i.test(reconnectError.message);
      if (!missing) throw reconnectError;
    }

    // The provider reports a unique-key collision but cannot resolve this ID.
    // Its documented DELETE accepts session_id and is the only supported way
    // to clear this stale/orphaned registry entry before recreating it.
    console.warn('[D-API orphaned session id; deleting stale registry entry]', { sessionId });
    await dapiRequest(sessionPath, { method: 'DELETE' });

    await createSession();
    return 'recovered';
  }
}

function safeDapiDetails(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let serialized: string;
  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '[unserializable provider details]';
  }
  const secrets = [
    process.env.DAPI_API_KEY,
    process.env.DAPI_WEBHOOK_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  for (const secret of secrets) serialized = serialized.split(secret).join('[REDACTED]');
  return serialized.slice(0, 4000);
}

async function persistSessionId(
  supabase: any,
  organizationId: string,
  connection: Connection | null,
  sessionId: string,
): Promise<{ connectionId: string } | { response: Response }> {
  if (connection) {
    if (connection.provider_account_id === sessionId) return { connectionId: connection.id };

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
      // Fail before touching workspace data when a required server secret is missing.
      getDapiApiKey();
      const webhookUrl = buildDapiWebhookUrl();
      const storedSessionId = connection?.provider_account_id;
      const sessionId = storedSessionId && /^[a-z0-9-]+$/.test(storedSessionId)
        ? storedSessionId
        : stableSessionId(organizationId);

      // Persist the stable session identifier before provisioning it at D-API.
      const persisted = await persistSessionId(
        supabase,
        organizationId,
        connection,
        sessionId,
      );
      if ('response' in persisted) return persisted.response;

      const sessionAction = await createOrRecoverDapiSession(sessionId, webhookUrl);

      const { error: updateError } = await supabase
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

      if (updateError) {
        return NextResponse.json(
          { error: 'A sessão foi criada na D-API, mas não foi possível atualizar o workspace.' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        sessionId,
        status: 'pending',
        message: sessionAction === 'created'
          ? 'Sessão criada na D-API. Aguardando QR Code.'
          : 'Sessão existente reiniciada na D-API. Aguardando QR Code.',
        sessionAction,
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
    console.error('[D-API connect handler failed]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      status: error instanceof DapiError ? error.status : undefined,
      code: error instanceof DapiError ? error.code : undefined,
      traceId: error instanceof DapiError ? error.traceId : undefined,
      details: error instanceof DapiError ? safeDapiDetails(error.details) : undefined,
    });
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
      const sessionId = connection.provider_account_id;
      const qrPath = `/sessions/${encodeURIComponent(sessionId)}/qr`;
      const waitingResponse = () => NextResponse.json({
        status: 'pending',
        waiting: true,
        qrCode: null,
        qrCodeImage: null,
        qrCodeUpdatedAt: null,
      });

      const fetchQr = () => dapiRequest<Record<string, unknown>>(qrPath, {}, {
        onResponse: (httpStatus, payload) => {
          const root = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload as Record<string, unknown>
            : {};
          const resource = unwrapDapiResource(payload);
          const providerError = typeof root.error === 'string'
            ? root.error
            : typeof resource.error === 'string' ? resource.error : undefined;
          console.log('[D-API QR response]', {
            sessionId,
            httpStatus,
            responseKeys: Object.keys(root),
            resourceKeys: Object.keys(resource),
            providerStatus: extractDapiConnectionStatus(payload),
            providerError,
            code: typeof root.code === 'string' || typeof root.code === 'number' ? root.code : undefined,
            traceId: typeof root.traceId === 'string' ? root.traceId : undefined,
            // Intentionally never log qrCode, qrImage, authorization headers or secrets.
          });
        },
      });
      let qrResponse: Record<string, unknown>;

      try {
        qrResponse = await fetchQr();
      } catch (error) {
        if (!(error instanceof DapiError)) throw error;
        const qrUnavailable = /qr code not available/i.test(error.message);
        const sessionNotFound = /session not found/i.test(error.message);
        if (!qrUnavailable && !sessionNotFound) throw error;

        console.error('[D-API QR request returned an API error]', {
          sessionId,
          status: error.status,
          message: error.message,
          code: error.code,
          traceId: error.traceId,
        });

        let missingSessionError: DapiError | null = null;
        if (qrUnavailable) {
          // A missing QR does not mean the session is still waiting: once paired,
          // D-API may stop returning a QR. Check the authoritative session status.
          try {
            const sessionResponse = await dapiRequest<Record<string, unknown>>(
              `/sessions/${encodeURIComponent(sessionId)}`,
            );
            const session = unwrapDapiResource(sessionResponse);
            const providerStatus = extractDapiConnectionStatus(sessionResponse);
            if (providerStatus) {
              const sessionStatus = normalizeDapiStatus(providerStatus);
              if (sessionStatus !== 'pending') {
                const displayName =
                  typeof session.phone === 'string' ? session.phone :
                  typeof session.phoneNumber === 'string' ? session.phoneNumber :
                  typeof session.displayName === 'string' ? session.displayName :
                  connection.display_name;
                const { error: persistError } = await supabase
                  .from('channel_connections')
                  .update({
                    status: sessionStatus,
                    display_name: sessionStatus === 'connected' ? displayName : connection.display_name,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', connection.id)
                  .eq('organization_id', organizationId);
                if (persistError) {
                  return NextResponse.json(
                    { error: 'A D-API informou o status, mas o Tendi não conseguiu salvá-lo.' },
                    { status: 500 },
                  );
                }
                return NextResponse.json({
                  status: sessionStatus,
                  providerStatus,
                  displayName,
                  qrCode: null,
                  qrCodeImage: null,
                  waiting: false,
                });
              }
            }
            return waitingResponse();
          } catch (sessionError) {
            if (
              sessionError instanceof DapiError &&
              /session not found/i.test(sessionError.message)
            ) {
              // D-API may encode this provider error in an HTTP 200 JSON envelope.
              missingSessionError = sessionError;
            } else {
              throw sessionError;
            }
          }
        } else if (sessionNotFound) {
          missingSessionError = error;
        }

        if (!missingSessionError) return waitingResponse();

        const updatedAt = connection.updated_at ? Date.parse(connection.updated_at) : NaN;
        const canRecreate = Number.isFinite(updatedAt) && Date.now() - updatedAt > 20_000;
        if (!canRecreate) return waitingResponse();

        const webhookUrl = buildDapiWebhookUrl();
        await createOrRecoverDapiSession(sessionId, webhookUrl);
        const now = new Date().toISOString();
        const { error: timestampError } = await supabase
          .from('channel_connections')
          .update({ updated_at: now, status: 'pending' })
          .eq('id', connection.id)
          .eq('organization_id', organizationId);
        if (timestampError) {
          return NextResponse.json(
            { error: 'A sessão foi recriada na D-API, mas não foi possível atualizar o controle local.' },
            { status: 500 },
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          qrResponse = await fetchQr();
        } catch (retryError) {
          if (retryError instanceof DapiError) {
            console.error('[D-API QR retry error]', {
              sessionId,
              status: retryError.status,
              message: retryError.message,
              code: retryError.code,
              traceId: retryError.traceId,
            });
            if (/qr code not available/i.test(retryError.message)) return waitingResponse();
            if (/session not found/i.test(retryError.message)) {
              console.error('[D-API session missing after recreation]', {
                sessionId,
                traceId: retryError.traceId,
              });
              return NextResponse.json({
                status: 'error',
                error: 'Sessão não encontrada na D-API mesmo após recriar',
                diagnostic: { code: retryError.code, traceId: retryError.traceId },
              });
            }
          }
          throw retryError;
        }
      }

      const qr = unwrapDapiResource(qrResponse);
      const rawStatus = extractDapiConnectionStatus(qrResponse) ??
        (typeof qr.status === 'string' ? qr.status : 'connecting');
      const status = normalizeDapiStatus(rawStatus);
      // The QR endpoint and connection.qrcode event may expose different field names.
      // Accept both documented variants without changing the D-API request contract.
      const pickString = (...keys: string[]): string | null => {
        for (const key of keys) {
          const value = qr[key] ?? qrResponse[key];
          if (typeof value === 'string' && value.length > 0) return value;
        }
        return null;
      };
      const qrCode = pickString('qrCode', 'qr');
      const qrCodeImage = pickString('qrCodeImage', 'qrImage');
      const qrCodeUpdatedAt = typeof qr.qrCodeUpdatedAt === 'string' ? qr.qrCodeUpdatedAt : null;

      if (status === 'connected' || status === 'disconnected' || status === 'error') {
        const { error: persistError } = await supabase
          .from('channel_connections')
          .update({
            status,
            display_name: status === 'connected' ? 'WhatsApp conectado' : connection.display_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id)
          .eq('organization_id', organizationId);

        if (persistError) {
          return NextResponse.json(
            { error: 'A D-API retornou o status, mas não foi possível salvá-lo no Tendi.' },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({
        status,
        qrCode,
        qrCodeImage,
        qrCodeUpdatedAt,
        waiting: !qrCode && !qrCodeImage && status === 'pending',
        // Safe diagnostics: names and presence flags only, never QR contents or secrets.
        diagnostic: {
          providerStatus: rawStatus,
          responseKeys: Object.keys(qrResponse),
          resourceKeys: Object.keys(qr),
          qrCodePresent: Boolean(qrCode),
          qrCodeImagePresent: Boolean(qrCodeImage),
        },
      });
    }

    if (params.action === 'status') {
      const sessionResponse = await dapiRequest<Record<string, unknown>>(
        `/sessions/${encodeURIComponent(connection.provider_account_id)}`,
      );
      const session = unwrapDapiResource(sessionResponse);
      const rawStatus = extractDapiConnectionStatus(sessionResponse);
      if (!rawStatus) {
        console.error('[D-API session status missing]', {
          sessionId: connection.provider_account_id,
          responseKeys: Object.keys(session),
        });
        return NextResponse.json(
          { error: 'A D-API respondeu, mas não retornou o campo de status da sessão.' },
          { status: 502 },
        );
      }

      const status = normalizeDapiStatus(rawStatus);
      const displayName =
        typeof session.phone === 'string'
          ? session.phone
          : typeof session.phoneNumber === 'string'
            ? session.phoneNumber
            : typeof session.displayName === 'string'
              ? session.displayName
              : connection.display_name;

      const { error: persistError } = await supabase
        .from('channel_connections')
        .update({ status, display_name: displayName, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
        .eq('organization_id', organizationId);

      if (persistError) {
        console.error('[D-API status persistence failed]', {
          sessionId: connection.provider_account_id,
          message: persistError.message,
        });
        return NextResponse.json(
          { error: 'A D-API informou o status, mas o Tendi não conseguiu salvá-lo.' },
          { status: 500 },
        );
      }

      return NextResponse.json({ status, providerStatus: rawStatus, displayName });
    }

    return NextResponse.json({ error: 'Ação não encontrada.' }, { status: 404 });
  } catch (error) {
    console.error('[D-API QR handler failed]', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      status: error instanceof DapiError ? error.status : undefined,
      code: error instanceof DapiError ? error.code : undefined,
      traceId: error instanceof DapiError ? error.traceId : undefined,
    });
    const message = error instanceof Error ? error.message : 'Falha ao consultar a D-API.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
