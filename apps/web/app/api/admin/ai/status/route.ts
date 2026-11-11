import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { getProviderKeyStatus } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ai/status
 * Informa (só ao Super Admin) quais chaves de API de IA estão configuradas e de onde vêm
 * (painel/Vault ou variável de ambiente). Devolve no máximo os 4 últimos caracteres: a chave nunca sai do servidor.
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const keys = await getProviderKeyStatus(auth.admin);
  return NextResponse.json({ keys });
}
