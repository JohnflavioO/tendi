import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMetaPages, metaPost } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const TOKEN_COOKIE = 'tendi_meta_user_token';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function upsertConnection(admin: ReturnType<typeof createAdminClient>, input: { organizationId: string; channel: 'messenger' | 'instagram'; providerAccountId: string; displayName: string }): Promise<string> {
  const existing = await admin!.from('channel_connections').select('id').eq('organization_id', input.organizationId).eq('channel', input.channel).maybeSingle();
  if (existing.data) {
    await admin!.from('channel_connections').update({ provider_account_id: input.providerAccountId, display_name: input.displayName, status: 'connected', updated_at: new Date().toISOString() }).eq('id', existing.data.id);
    return existing.data.id as string;
  }
  const created = await admin!.from('channel_connections').insert({ organization_id: input.organizationId, channel: input.channel, provider_account_id: input.providerAccountId, display_name: input.displayName, status: 'connected', settings: { provider: 'meta' } }).select('id').single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? 'Não foi possível salvar a conexão.');
  return (created.data as { id: string }).id;
}

/**
 * POST /api/meta/connect   { organizationId, pageId }
 * Última etapa: liga a página escolhida (Messenger e, se houver, o Instagram dela) a este
 * workspace, guarda o token no Vault e inscreve a página para receber mensagens por webhook.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const pageId = typeof body?.pageId === 'string' ? body.pageId : '';
  if (!UUID_RE.test(organizationId) || !pageId) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const { data: membership } = await (supabase as any).from('organization_memberships').select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Somente o dono ou um administrador pode conectar o Instagram/Messenger.' }, { status: 403 });

  const token = request.headers.get('cookie')?.match(new RegExp(`${TOKEN_COOKIE}=([^;]+)`))?.[1];
  if (!token) return NextResponse.json({ error: 'Sua sessão com a Meta expirou. Clique em "Conectar com Facebook" de novo.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  try {
    const pages = await listMetaPages(decodeURIComponent(token));
    const page = pages.find(item => item.id === pageId);
    if (!page) return NextResponse.json({ error: 'Página não encontrada. Refaça a conexão.' }, { status: 404 });

    const connectedChannels: string[] = [];

    const messengerId = await upsertConnection(admin, { organizationId, channel: 'messenger', providerAccountId: page.id, displayName: page.name });
    await admin.rpc('set_channel_secret', { p_connection_id: messengerId, p_value: page.access_token });
    connectedChannels.push('messenger');

    if (page.instagram_business_account?.id) {
      const instagramId = await upsertConnection(admin, { organizationId, channel: 'instagram', providerAccountId: page.instagram_business_account.id, displayName: page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : page.name });
      await admin.rpc('set_channel_secret', { p_connection_id: instagramId, p_value: page.access_token });
      connectedChannels.push('instagram');
    }

    // Inscreve a página para passar a entregar mensagens no nosso webhook.
    await metaPost(`/${page.id}/subscribed_apps`, { access_token: page.access_token, subscribed_fields: 'messages,messaging_postbacks' })
      .catch(error => console.warn('[Meta connect] inscrição do webhook falhou', { pageId: page.id, message: error instanceof Error ? error.message : String(error) }));

    const response = NextResponse.json({ success: true, channels: connectedChannels, pageName: page.name, instagramUsername: page.instagram_business_account?.username ?? null });
    response.cookies.set(TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a conexão.' }, { status: 502 });
  }
}
