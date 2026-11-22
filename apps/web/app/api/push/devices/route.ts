import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const bad = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return bad('Sessão não autenticada.', 401);

  let body: unknown;
  try { body = await request.json(); } catch { return bad('JSON inválido.', 400); }
  if (!body || typeof body !== 'object') return bad('Dados inválidos.', 400);
  const input = body as Record<string, unknown>;
  const organizationId = input.organizationId;
  const token = input.token;
  const platform = input.platform;
  if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId) ||
      typeof token !== 'string' || token.length < 30 || token.length > 4096 ||
      platform !== 'web') return bad('Dispositivo inválido.', 400);

  // Authorization must be checked with the caller's RLS-scoped session.
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError || !membership) return bad('Sem acesso à empresa.', 403);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', auth.user.id)
    .maybeSingle();
  const activeProfile = profile as { is_active: boolean } | null;
  if (profileError || !activeProfile?.is_active) return bad('Usuário inativo.', 403);

  const admin = createAdminClient();
  if (!admin) return bad('Serviço de notificações indisponível.', 503);
  const now = new Date().toISOString();
  // A token belongs to exactly one user/org. Prevent a different account from
  // taking ownership of an existing token on a shared browser.
  const { data: existing, error: lookupError } = await admin.from('push_devices')
    .select('id,organization_id,user_id').eq('fcm_token', token).maybeSingle();
  if (lookupError) return bad('Falha ao verificar dispositivo.', 500);
  if (existing && (existing.user_id !== auth.user.id || existing.organization_id !== organizationId)) {
    return bad('Este dispositivo já está associado a outra conta. Revogue a inscrição anterior.', 409);
  }
  const { error } = existing
    ? await admin.from('push_devices').update({ enabled: true, last_seen_at: now, updated_at: now }).eq('id', existing.id)
    : await admin.from('push_devices').insert({ organization_id: organizationId, user_id: auth.user.id, fcm_token: token, platform: 'web', enabled: true, last_seen_at: now });
  if (error) return bad('Não foi possível registrar o dispositivo.', 500);
  return NextResponse.json({ ok: true });
}
