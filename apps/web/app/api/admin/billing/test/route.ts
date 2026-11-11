import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { getPlatformSecret } from '@/lib/billing';
import { createPagarmeClient, PagarmeError } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

/** POST /api/admin/billing/test -> consulta a lista de planos para confirmar que a chave funciona. */
export async function POST() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const key = await getPlatformSecret(auth.admin, 'pagarme_secret_key');
  if (!key) return NextResponse.json({ ok: false, error: 'Cole a chave secreta antes de testar.' });
  try {
    const result = await createPagarmeClient(key)<{ data?: unknown[] }>('/plans?page=1&size=1');
    return NextResponse.json({ ok: true, plans: Array.isArray(result?.data) ? result.data.length : 0 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof PagarmeError ? error.message : 'Não foi possível conectar à Pagar.me.' });
  }
}
