import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTestPush } from '@/lib/firebase-server';

export const runtime = 'nodejs';
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return fail('Sessão não autenticada.', 401);
  let input: unknown;
  try { input = await request.json(); } catch { return fail('JSON inválido.', 400); }
  if (!input || typeof input !== 'object') return fail('Dados inválidos.', 400);
  const organizationId = (input as Record<string, unknown>).organizationId;
  if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId)) {
    return fail('Empresa inválida.', 400);
  }
  const { data: membership, error: membershipError } = await supabase.from('organization_memberships')
    .select('organization_id').eq('organization_id', organizationId)
    .eq('user_id', auth.user.id).eq('status', 'active').maybeSingle();
  if (membershipError || !membership) return fail('Sem acesso à empresa.', 403);
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('is_active').eq('id', auth.user.id).maybeSingle();
  const activeProfile = profile as { is_active: boolean } | null;
  if (profileError || !activeProfile?.is_active) return fail('Usuário inativo.', 403);

  const admin = createAdminClient();
  if (!admin) return fail('Serviço de notificações indisponível.', 503);
  const { data: devices, error: deviceError } = await admin.from('push_devices')
    .select('fcm_token').eq('organization_id', organizationId).eq('user_id', auth.user.id)
    .eq('enabled', true).order('last_seen_at', { ascending: false }).limit(1);
  if (deviceError) return fail('Falha ao consultar dispositivo.', 500);
  if (!devices?.length) return fail('Ative as notificações neste dispositivo antes de testar.', 409);

  // Database uniqueness limits test sends to one attempt per minute per user and tenant.
  const minute = Math.floor(Date.now() / 60000);
  const { error: limitError } = await admin.from('notifications').insert({
    organization_id: organizationId,
    recipient_user_id: auth.user.id,
    event_type: 'push_test',
    title: 'Teste de notificação',
    body: 'Solicitação de teste enviada ao Firebase.',
    target_path: '/agenda',
    deduplication_key: `push-test:${minute}`,
  });
  if (limitError?.code === '23505') return fail('Aguarde um minuto antes de testar novamente.', 429);
  if (limitError) return fail('Não foi possível registrar o teste.', 500);

  try {
    await sendTestPush(devices[0].fcm_token);
    return NextResponse.json({ ok: true, message: 'Teste enviado ao Firebase. Confirme o recebimento no dispositivo.' });
  } catch {
    return fail('Não foi possível enviar o push. Verifique as credenciais e o Firebase Cloud Messaging.', 503);
  }
}
