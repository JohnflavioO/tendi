import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMetaAppId, metaGet, metaPost } from '@/lib/meta-client';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

type Step = { label: string; ok: boolean; detail: string };

/**
 * POST /api/meta/instagram/check   { organizationId }
 * Confere, com o token guardado, se o Instagram conectado pode receber mensagens: a Página
 * ligada, a inscrição dela no app (subscribed_apps, que faz a Meta entregar as mensagens no
 * webhook) e a conta do Instagram. Se a Página não estiver inscrita, inscreve na hora.
 * Também mostra o último aviso que a Meta mandou ao webhook. Nenhum token sai daqui.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });
  const { data: membership } = await (supabase as any).from('organization_memberships').select('role').eq('organization_id', organizationId).eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: 'Somente o dono ou um administrador pode verificar.' }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 });

  const { data: connection } = await admin.from('channel_connections').select('id,provider_account_id,status,settings')
    .eq('organization_id', organizationId).eq('channel', 'instagram').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const conn = connection as { id: string; provider_account_id: string | null; status: string; settings?: { page_id?: unknown } | null } | null;
  if (!conn || conn.status !== 'connected') return NextResponse.json({ error: 'O Instagram não está conectado.' }, { status: 404 });

  const steps: Step[] = [];
  const { data: token } = await admin.rpc('get_channel_secret', { p_connection_id: conn.id });
  if (typeof token !== 'string' || !token) {
    steps.push({ label: 'Token da Página', ok: false, detail: 'Não encontrado. Desconecte e conecte o Instagram de novo.' });
    return NextResponse.json({ steps });
  }
  steps.push({ label: 'Token da Página', ok: true, detail: 'Guardado.' });

  // Ler a Página pelo /me exige pages_read_engagement, que o TendiDesk não pede. O id vem do que
  // foi guardado ao conectar ou, nas conexões antigas, do Messenger da mesma empresa (mesma Página).
  let pageId = typeof conn.settings?.page_id === 'string' ? conn.settings.page_id : '';
  if (!pageId) {
    const { data: messenger } = await admin.from('channel_connections').select('provider_account_id')
      .eq('organization_id', organizationId).eq('channel', 'messenger').eq('status', 'connected').order('created_at', { ascending: false }).limit(1).maybeSingle();
    pageId = (messenger as { provider_account_id?: string | null } | null)?.provider_account_id ?? '';
  }
  steps.push({ label: 'Página do Facebook', ok: Boolean(pageId), detail: pageId ? `id ${pageId}` : 'Não identificada. Desconecte e conecte o Instagram de novo.' });

  if (conn.provider_account_id) {
    try {
      const ig = await metaGet(`/${conn.provider_account_id}`, { access_token: token, fields: 'id,username' }) as { username?: string };
      steps.push({ label: 'Conta do Instagram', ok: true, detail: ig.username ? `@${ig.username}` : conn.provider_account_id });
    } catch (error) {
      steps.push({ label: 'Conta do Instagram', ok: false, detail: errorText(error) });
    }
  }

  if (pageId) {
    const appId = getMetaAppId();
    const readSubscription = async () => {
      const result = await metaGet(`/${pageId}/subscribed_apps`, { access_token: token }) as { data?: Array<{ id?: string; subscribed_fields?: string[] }> };
      return (result.data ?? []).find(item => item.id === appId) ?? null;
    };
    try {
      let mine = await readSubscription();
      let subscribedNow = false;
      if (!mine?.subscribed_fields?.includes('messages')) {
        await metaPost(`/${pageId}/subscribed_apps`, { access_token: token, subscribed_fields: 'messages,messaging_postbacks' });
        subscribedNow = true;
        mine = await readSubscription();
      }
      const fields = mine?.subscribed_fields ?? [];
      steps.push({
        label: 'Página inscrita no app (receber mensagens)',
        ok: fields.includes('messages'),
        detail: fields.length ? `${subscribedNow ? 'Inscrita agora. ' : ''}Campos: ${fields.join(', ')}` : 'Não inscrita.',
      });
    } catch (error) {
      steps.push({ label: 'Página inscrita no app (receber mensagens)', ok: false, detail: errorText(error) });
    }
  }

  const { data: last } = await admin.from('platform_settings').select('value').eq('key', 'meta_webhook_last').maybeSingle();
  const lastValue = (last as { value?: { at?: string; object?: string; signature_ok?: boolean; matched?: boolean } } | null)?.value;
  steps.push({
    label: 'Último aviso da Meta no webhook',
    ok: Boolean(lastValue?.at && lastValue.signature_ok !== false),
    detail: lastValue?.at
      ? `${new Date(lastValue.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${lastValue.object ?? '?'}${lastValue.signature_ok === false ? ' · assinatura inválida (confira META_APP_SECRET)' : ''}${lastValue.matched === false ? ' · conta não reconhecida' : ''}`
      : 'Nenhum aviso recebido ainda.',
  });

  return NextResponse.json({ steps });
}
