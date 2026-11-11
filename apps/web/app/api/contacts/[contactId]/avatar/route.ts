import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dapiRequest } from '@/lib/dapi';
import { avatarIsFresh, pickAvatarUrl } from '@/lib/contact-avatar';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE = 'private, max-age=3600';

const none = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': CACHE } });
const photo = (url: string) => NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': CACHE } });

/**
 * GET /api/contacts/<id>/avatar
 * Redireciona para a foto de perfil do WhatsApp do contato, ou 404 quando não há foto pública
 * (a tela mostra as iniciais). A foto é buscada na D-API uma vez e reaproveitada por alguns dias.
 */
export async function GET(_request: Request, { params }: { params: { contactId: string } }) {
  if (!UUID_RE.test(params.contactId)) return none();
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return new NextResponse(null, { status: 401 });

  // As regras de acesso do usuário garantem que o contato é de uma empresa dele.
  const { data: contact } = await supabase.from('contacts')
    .select('id,organization_id,phone_e164,avatar_url,avatar_checked_at')
    .eq('id', params.contactId)
    .maybeSingle();
  if (!contact) return none();
  if (avatarIsFresh(contact.avatar_checked_at)) return contact.avatar_url ? photo(contact.avatar_url) : none();

  const admin = createAdminClient();
  const phone = String(contact.phone_e164 ?? '').replace(/\D/g, '');
  if (!admin || !/^\d{8,15}$/.test(phone)) return contact.avatar_url ? photo(contact.avatar_url) : none();

  const { data: connection } = await admin.from('channel_connections')
    .select('provider_account_id,status')
    .eq('organization_id', contact.organization_id)
    .eq('channel', 'whatsapp')
    .maybeSingle();
  if (!connection?.provider_account_id || connection.status !== 'connected') return contact.avatar_url ? photo(contact.avatar_url) : none();

  let url: string | null = null;
  try {
    const response = await dapiRequest<unknown>(
      `/contacts/${phone}/avatar?sessionId=${encodeURIComponent(connection.provider_account_id)}`,
      { method: 'GET', signal: AbortSignal.timeout(6_000) },
    );
    url = pickAvatarUrl(response);
  } catch (error) {
    // Sem foto pública, privacidade ou falha momentânea: marca a consulta para não repetir a cada abertura.
    console.info('[Avatar] sem foto', { contactId: contact.id, message: error instanceof Error ? error.message.slice(0, 120) : String(error) });
  }
  await admin.from('contacts').update({ avatar_url: url, avatar_checked_at: new Date().toISOString() }).eq('id', contact.id);
  return url ? photo(url) : none();
}
