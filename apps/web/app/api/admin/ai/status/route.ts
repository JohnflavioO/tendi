import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_PROVIDERS } from '@/lib/ai-agent';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ai/status
 * Informa (só ao super admin) quais chaves de API de IA estão configuradas no servidor.
 * Devolve apenas true/false. O valor das chaves nunca sai do servidor.
 */
export async function GET() {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: 'Acesso restrito ao Super Admin.' }, { status: 403 });

  const keys = Object.fromEntries(AI_PROVIDERS.map(provider => [provider.value, Boolean(process.env[provider.envKey]?.trim())]));
  return NextResponse.json({ keys });
}
