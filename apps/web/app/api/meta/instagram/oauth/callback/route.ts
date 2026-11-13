import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { instagramAccessTokenParams, instagramLongLivedTokenParams } from '@/lib/meta';
import { exchangeInstagramCode, exchangeInstagramLongLivedToken, getInstagramAccount, getInstagramAppId, getInstagramAppSecret } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tendi_ig_oauth_state';

function backToChannels(request: Request, organizationId: string, params: Record<string, string>) {
  const url = new URL('/chatbots', request.url);
  url.searchParams.set('organization', organizationId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function upsertInstagramConnection(admin: NonNullable<ReturnType<typeof createAdminClient>>, input: { organizationId: string; providerAccountId: string; displayName: string }): Promise<string> {
  const existing = await admin.from('channel_connections').select('id').eq('organization_id', input.organizationId).eq('channel', 'instagram').maybeSingle();
  if (existing.data) {
    await admin.from('channel_connections').update({ provider_account_id: input.providerAccountId, display_name: input.displayName, status: 'connected', updated_at: new Date().toISOString() }).eq('id', existing.data.id);
    return existing.data.id as string;
  }
  const created = await admin.from('channel_connections').insert({ organization_id: input.organizationId, channel: 'instagram', provider_account_id: input.providerAccountId, display_name: input.displayName, status: 'connected', settings: { provider: 'meta_instagram_login' } }).select('id').single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? 'Não foi possível salvar a conexão.');
  return (created.data as { id: string }).id;
}

/**
 * GET /api/meta/instagram/oauth/callback
 * O Instagram volta para cá já com o código. Diferente do Messenger, aqui não há página para
 * escolher: a conta autorizada é sempre a mesma que fez o login, então a conexão é concluída
 * direto, sem etapa de escolha.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = request.headers.get('cookie')?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  let saved: { state: string; organizationId: string } | null = null;
  try { saved = stateCookie ? JSON.parse(decodeURIComponent(stateCookie)) : null; } catch { saved = null; }

  if (!saved) return NextResponse.redirect(new URL('/chatbots?igError=sessao_expirada', request.url));
  const organizationId = saved.organizationId;
  const clearState = (response: NextResponse) => { response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' }); return response; };

  if (url.searchParams.get('error')) {
    return clearState(NextResponse.redirect(backToChannels(request, organizationId, { igError: 'cancelado' })));
  }
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code || state !== saved.state) {
    return clearState(NextResponse.redirect(backToChannels(request, organizationId, { igError: 'estado_invalido' })));
  }

  const admin = createAdminClient();
  if (!admin) return clearState(NextResponse.redirect(backToChannels(request, organizationId, { igError: 'servidor_sem_credenciais' })));

  try {
    const appId = getInstagramAppId();
    const appSecret = getInstagramAppSecret();
    const redirectUri = new URL('/api/meta/instagram/oauth/callback', request.url).toString();
    const exchanged = await exchangeInstagramCode(instagramAccessTokenParams({ appId, appSecret, redirectUri, code }));
    const longLivedToken = await exchangeInstagramLongLivedToken(instagramLongLivedTokenParams({ appSecret, shortLivedToken: exchanged.accessToken }));
    const account = await getInstagramAccount(longLivedToken);

    const connectionId = await upsertInstagramConnection(admin, {
      organizationId,
      providerAccountId: account.id,
      displayName: account.username ? `@${account.username}` : 'Instagram',
    });
    await admin.rpc('set_channel_secret', { p_connection_id: connectionId, p_value: longLivedToken });

    return clearState(NextResponse.redirect(backToChannels(request, organizationId, { igConnected: account.username ?? '1' })));
  } catch (error) {
    console.error('[Instagram OAuth] falha ao concluir a conexão', { message: error instanceof Error ? error.message : String(error) });
    return clearState(NextResponse.redirect(backToChannels(request, organizationId, { igError: 'falha_na_conexao' })));
  }
}
