import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { getPlatformSecret, setPlatformSecret, SUBSCRIPTION_EVENTS } from '@/lib/billing';
import { isTestKey, validateSecretKey } from '@/lib/pagarme';

export const dynamic = 'force-dynamic';

type Admin = Extract<Awaited<ReturnType<typeof requireSuperAdmin>>, { ok: true }>['admin'];

/** Segredo do webhook: gerado uma vez e guardado no Vault. Vai no caminho da URL do webhook. */
async function ensureWebhookSecret(admin: Admin): Promise<string | null> {
  const existing = await getPlatformSecret(admin, 'pagarme_webhook_secret');
  if (existing) return existing;
  const created = randomBytes(24).toString('base64url');
  return (await setPlatformSecret(admin, 'pagarme_webhook_secret', created)) ? null : created;
}

async function status(admin: Admin, origin: string) {
  const key = await getPlatformSecret(admin, 'pagarme_secret_key');
  const webhookSecret = await ensureWebhookSecret(admin);
  return {
    secretKey: key ? { configured: true, environment: isTestKey(key) ? 'teste' : 'produção', hint: key.slice(-4) } : { configured: false },
    webhookUrl: webhookSecret ? `${origin}/api/webhooks/pagarme/${webhookSecret}` : null,
    events: SUBSCRIPTION_EVENTS,
  };
}

const originOf = (request: Request) => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;

/**
 * GET    /api/admin/billing                    -> situação da conexão com a Pagar.me e URL do webhook
 * POST   /api/admin/billing { secretKey }      -> grava a chave secreta no Vault
 * DELETE /api/admin/billing                    -> remove a chave
 * Só o Super Admin. A chave nunca volta para o navegador (só os 4 últimos caracteres).
 */
export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await status(auth.admin, originOf(request)));
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const secretKey = typeof body?.secretKey === 'string' ? body.secretKey.trim() : '';
  const invalid = validateSecretKey(secretKey);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const error = await setPlatformSecret(auth.admin, 'pagarme_secret_key', secretKey);
  if (error) {
    console.error('[Pagar.me] chave não salva', { message: error });
    return NextResponse.json({ error: 'Não foi possível salvar a chave. Confirme se a migração de cobrança foi aplicada no Supabase.' }, { status: 500 });
  }
  return NextResponse.json(await status(auth.admin, originOf(request)));
}

export async function DELETE(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const error = await setPlatformSecret(auth.admin, 'pagarme_secret_key', null);
  if (error) return NextResponse.json({ error: 'Não foi possível remover a chave.' }, { status: 500 });
  return NextResponse.json(await status(auth.admin, originOf(request)));
}
