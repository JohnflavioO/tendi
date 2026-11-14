import { NextResponse } from 'next/server';
import { metaAccessTokenParams, metaLongLivedTokenParams } from '@/lib/meta';
import { getMetaAppId, getMetaAppSecret, metaGet } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tendi_meta_oauth_state';
const TOKEN_COOKIE = 'tendi_meta_user_token';

function backToChannels(request: Request, organizationId: string, params: Record<string, string>) {
  const url = new URL('/chatbots', request.url);
  url.searchParams.set('organization', organizationId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/**
 * GET /api/meta/oauth/callback
 * A Meta volta para cá depois do login. Troca o código por um token de usuário de longa duração
 * e guarda num cookie por 10 minutos só para a próxima etapa (escolher a página).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = request.headers.get('cookie')?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  let saved: { state: string; organizationId: string } | null = null;
  try { saved = stateCookie ? JSON.parse(decodeURIComponent(stateCookie)) : null; } catch { saved = null; }

  if (!saved) return NextResponse.redirect(new URL('/chatbots?metaError=sessao_expirada', request.url));
  const organizationId = saved.organizationId;

  if (url.searchParams.get('error')) {
    return NextResponse.redirect(backToChannels(request, organizationId, { metaError: 'cancelado' }));
  }
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code || state !== saved.state) {
    return NextResponse.redirect(backToChannels(request, organizationId, { metaError: 'estado_invalido' }));
  }

  try {
    const appId = getMetaAppId();
    const appSecret = getMetaAppSecret();
    const redirectUri = new URL('/api/meta/oauth/callback', request.url).toString();
    const exchanged = await metaGet('/oauth/access_token', metaAccessTokenParams({ appId, appSecret, redirectUri, code }));
    const shortLivedToken = (exchanged as { access_token?: string }).access_token;
    if (!shortLivedToken) throw new Error('A Meta não devolveu um token de acesso.');

    const longLived = await metaGet('/oauth/access_token', metaLongLivedTokenParams({ appId, appSecret, shortLivedToken }));
    const userToken = (longLived as { access_token?: string }).access_token ?? shortLivedToken;

    const response = NextResponse.redirect(backToChannels(request, organizationId, { metaStep: 'choose' }));
    response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' });
    response.cookies.set(TOKEN_COOKIE, userToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
    return response;
  } catch (error) {
    console.error('[Meta OAuth] falha na troca de token', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(backToChannels(request, organizationId, { metaError: 'falha_na_troca_de_token' }));
  }
}
