import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateInvitations } from '@/lib/team-server';
import { destinationAfterLink, isOtpType, safeNext } from '@/lib/auth-redirect';

export const dynamic = 'force-dynamic';

/**
 * GET /auth/confirm?token_hash=...&type=recovery|invite|magiclink|signup|email_change[&next=/...]
 * Valida links de e-mail do Supabase em QUALQUER aparelho (diferente do fluxo com "code", que só funciona
 * no mesmo navegador que pediu o link). Usado pelo modelo "Redefinir senha".
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const type = isOtpType(rawType) ? rawType : null;
  if (!tokenHash || !type) return NextResponse.redirect(new URL('/login?erro=link', origin));

  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data?.user) return NextResponse.redirect(new URL('/login?erro=link', origin));

  // Convite de equipe aceito por este link: ativa o vínculo.
  const admin = createAdminClient();
  if (admin) await activateInvitations(admin, data.user.id).catch(() => 0);

  const destination = destinationAfterLink({
    type,
    needsPassword: Boolean(data.user.user_metadata?.needs_password),
    next: safeNext(searchParams.get('next')),
  });
  return NextResponse.redirect(new URL(destination, origin));
}
