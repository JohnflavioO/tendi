import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { metaDialogUrl } from '@/lib/meta';
import { getMetaAppId, isMetaConfigured } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_COOKIE = 'tendi_meta_oauth_state';

/**
 * GET /api/meta/oauth/start?organizationId=<id>
 * Leva o dono/administrador para a tela de login da Meta. O estado anti-CSRF fica num cookie
 * httpOnly de 10 minutos; a Meta devolve o mesmo valor no /callback, e conferimos os dois.
 */
export async function GET(request: Request) {
  if (!isMetaConfigured()) return NextResponse.json({ error: 'O app da Meta ainda não foi configurado no servidor.' }, { status: 503 });

  const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  const { data: membership } = await (supabase as any).from('organization_memberships').select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Somente o dono ou um administrador pode conectar o Instagram/Messenger.' }, { status: 403 });
  }

  const state = randomBytes(16).toString('hex');
  const redirectUri = new URL('/api/meta/oauth/callback', request.url).toString();
  const response = NextResponse.redirect(metaDialogUrl({ appId: getMetaAppId(), redirectUri, state }));
  response.cookies.set(STATE_COOKIE, JSON.stringify({ state, organizationId }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
