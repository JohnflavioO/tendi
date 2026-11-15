import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveActor } from '@/lib/team-server';
import { canAccess } from '@/lib/team';
import { isUuid } from '@/lib/team-route';
import { getBoletoProvider } from '@/lib/boleto-server';
import { connectIntegration, disconnectIntegration, readIntegration, setIntegrationEnabled, testLookup, type Outcome } from '@/lib/boleto-integration';

export const dynamic = 'force-dynamic';

/**
 * Integrações > 2ª via de boleto. Só dono ou administrador da empresa (área "integracoes").
 *   GET    ?organizationId=...                          situação (plano e integração, sem a chave)
 *   POST   { organizationId, provider, apiKey }         conecta (confere a chave e guarda no Vault)
 *   POST   { organizationId, action: 'test', document } testa a busca de boletos de um CPF/CNPJ
 *   PATCH  { organizationId, isEnabled }                liga ou pausa a 2ª via pela Duda
 *   DELETE { organizationId }                           desconecta e apaga a chave
 */
async function context(organizationId: unknown) {
  const supabase = (await createClient()) as any;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { response: NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 }) };
  if (!isUuid(organizationId)) return { response: NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 }) };
  const actor = await resolveActor(supabase, auth.user.id, organizationId);
  if (!actor || !canAccess(actor.role, 'integracoes')) {
    return { response: NextResponse.json({ error: 'Somente o dono ou um administrador cuida das integrações.' }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Servidor sem credenciais do banco.' }, { status: 503 }) };
  return { admin: admin as any, organizationId };
}

const reply = (outcome: Outcome) => NextResponse.json(outcome.body, { status: outcome.status, headers: { 'cache-control': 'no-store' } });
const body = async (request: Request) => ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

export async function GET(request: Request) {
  const ctx = await context(new URL(request.url).searchParams.get('organizationId'));
  if ('response' in ctx) return ctx.response;
  return reply(await readIntegration(ctx.admin, ctx.organizationId));
}

export async function POST(request: Request) {
  const input = await body(request);
  const ctx = await context(input.organizationId);
  if ('response' in ctx) return ctx.response;
  if (input.action === 'test') return reply(await testLookup(ctx.admin, ctx.organizationId, input.document, id => getBoletoProvider(id)));
  return reply(await connectIntegration(ctx.admin, ctx.organizationId, { provider: input.provider, apiKey: input.apiKey }, id => getBoletoProvider(id)));
}

export async function PATCH(request: Request) {
  const input = await body(request);
  const ctx = await context(input.organizationId);
  if ('response' in ctx) return ctx.response;
  return reply(await setIntegrationEnabled(ctx.admin, ctx.organizationId, input.isEnabled));
}

export async function DELETE(request: Request) {
  const input = await body(request);
  const ctx = await context(input.organizationId);
  if ('response' in ctx) return ctx.response;
  return reply(await disconnectIntegration(ctx.admin, ctx.organizationId));
}
