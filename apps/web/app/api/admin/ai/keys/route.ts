import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { getProviderKeyStatus, isAiProvider, saveProviderKey, validateApiKey } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';

/**
 * POST   /api/admin/ai/keys  { provider, apiKey }  -> grava/troca a chave no Supabase Vault
 * DELETE /api/admin/ai/keys?provider=anthropic      -> remove a chave do painel (volta a valer a variável de ambiente, se houver)
 * Só o Super Admin. A chave é gravada criptografada e nunca é devolvida.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = body?.provider;
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!isAiProvider(provider)) return NextResponse.json({ error: 'Provedor inválido.' }, { status: 400 });
  const invalid = validateApiKey(provider, apiKey);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const error = await saveProviderKey(auth.admin, provider, apiKey);
  if (error) {
    console.error('[IA] chave não salva', { provider, message: error });
    return NextResponse.json({ error: 'Não foi possível salvar a chave. Confirme se a migração do Vault foi aplicada no Supabase.' }, { status: 500 });
  }
  return NextResponse.json({ keys: await getProviderKeyStatus(auth.admin) });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const provider = new URL(request.url).searchParams.get('provider');
  if (!isAiProvider(provider)) return NextResponse.json({ error: 'Provedor inválido.' }, { status: 400 });
  const error = await saveProviderKey(auth.admin, provider, null);
  if (error) return NextResponse.json({ error: 'Não foi possível remover a chave.' }, { status: 500 });
  return NextResponse.json({ keys: await getProviderKeyStatus(auth.admin) });
}
