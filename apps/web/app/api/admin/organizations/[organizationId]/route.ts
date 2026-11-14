import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { dapiRequest } from '@/lib/dapi';
import { MEDIA_BUCKET } from '@/lib/inbox-attachments';
import { confirmsDeletion, isInternalOrganization, statusAfterReactivation } from '@/lib/company-control';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Context = { params: { organizationId: string } };
type Admin = Extract<Awaited<ReturnType<typeof requireSuperAdmin>>, { ok: true }>['admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

async function loadOrganization(admin: Admin, organizationId: string) {
  if (!UUID_RE.test(organizationId)) return null;
  const { data } = await admin.from('organizations').select('id,name,slug,status,plan_code,trial_ends_at').eq('id', organizationId).maybeSingle();
  return data as { id: string; name: string; slug: string; status: string; plan_code: string | null; trial_ends_at: string | null } | null;
}

/**
 * PATCH /api/admin/organizations/<id>
 *   { action: 'suspend' }      bloqueia o acesso da empresa (os dados ficam guardados)
 *   { action: 'reactivate' }   libera de novo
 *   { action: 'set_plan', planCode }
 * Só o Super Admin. Nenhuma dessas ações lê conversas ou contatos da empresa.
 */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const organization = await loadOrganization(auth.admin, params.organizationId);
  if (!organization) return fail(404, 'Empresa não encontrada.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'suspend') {
    if (isInternalOrganization(organization)) return fail(422, 'O workspace interno da plataforma não pode ser bloqueado.');
    const { error } = await auth.admin.from('organizations').update({ status: 'suspended' }).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível bloquear: ${error.message}`);
    // Quem estava com acesso de suporte liberado perde o acesso junto.
    await auth.admin.from('support_access_grants').update({ ended_at: new Date().toISOString(), ended_by: auth.userId }).eq('organization_id', organization.id).is('ended_at', null);
    return NextResponse.json({ status: 'suspended' });
  }

  if (action === 'reactivate') {
    const { data: subscription } = await auth.admin.from('billing_subscriptions').select('status').eq('organization_id', organization.id).eq('status', 'active').limit(1).maybeSingle();
    const status = statusAfterReactivation({ trialEndsAt: organization.trial_ends_at, hasActiveSubscription: Boolean(subscription) });
    const { error } = await auth.admin.from('organizations').update({ status }).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível reativar: ${error.message}`);
    return NextResponse.json({ status });
  }

  if (action === 'set_plan') {
    const planCode = typeof body?.planCode === 'string' ? body.planCode : '';
    const { data: plan } = await auth.admin.from('subscription_plans').select('code').eq('code', planCode).maybeSingle();
    if (!plan) return fail(400, 'Plano inválido.');
    const { error } = await auth.admin.from('organizations').update({ plan_code: planCode }).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível trocar o plano: ${error.message}`);
    return NextResponse.json({ planCode });
  }

  return fail(400, 'Ação inválida.');
}

/** Apaga os arquivos do Inbox da empresa (pasta <id>/<conversa>/arquivo). Melhor esforço: não impede a exclusão. */
async function removeMediaFiles(admin: Admin, organizationId: string): Promise<number> {
  const bucket = admin.storage.from(MEDIA_BUCKET);
  let removed = 0;
  for (let round = 0; round < 50; round += 1) {
    const { data: folders, error } = await bucket.list(organizationId, { limit: 100 });
    if (error || !folders?.length) break;
    let progressed = false;
    for (const folder of folders) {
      const prefix = `${organizationId}/${folder.name}`;
      const { data: files } = await bucket.list(prefix, { limit: 1000 });
      // Sem itens dentro: "folder" é um arquivo solto na raiz da empresa.
      const paths = files?.length ? files.map(file => `${prefix}/${file.name}`) : [prefix];
      const { error: removeError } = await bucket.remove(paths);
      if (!removeError) { removed += paths.length; progressed = true; }
    }
    if (!progressed) break;
  }
  return removed;
}

/**
 * DELETE /api/admin/organizations/<id>   { confirmName }
 * Exclui a empresa e TODOS os dados dela (conversas, contatos, CRM, agenda, equipe, arquivos).
 * Não tem volta. Exige o nome exato da empresa. As contas de login das pessoas não são apagadas.
 */
export async function DELETE(request: Request, { params }: Context) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const organization = await loadOrganization(auth.admin, params.organizationId);
  if (!organization) return fail(404, 'Empresa não encontrada.');
  if (isInternalOrganization(organization)) return fail(422, 'O workspace interno da plataforma não pode ser excluído.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!confirmsDeletion(body?.confirmName, organization.name)) return fail(400, 'Digite o nome exato da empresa para confirmar a exclusão.');

  // 1) Desliga a sessão do WhatsApp no provedor, para o número parar de entregar mensagens ao TendiDesk.
  const { data: connections } = await auth.admin.from('channel_connections').select('provider_account_id').eq('organization_id', organization.id);
  for (const connection of (connections ?? []) as Array<{ provider_account_id: string | null }>) {
    if (!connection.provider_account_id) continue;
    await dapiRequest(`/sessions/${encodeURIComponent(connection.provider_account_id)}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) })
      .catch(error => console.warn('[Admin] sessão do WhatsApp não removida na exclusão', { organizationId: organization.id, message: error instanceof Error ? error.message : String(error) }));
  }

  // 2) Arquivos de mídia (o banco não apaga arquivos do Storage sozinho).
  const filesRemoved = await removeMediaFiles(auth.admin, organization.id).catch(() => 0);

  // 3) A empresa. As tabelas ligadas a ela são apagadas em cascata pelo banco.
  const { error } = await auth.admin.from('organizations').delete().eq('id', organization.id);
  if (error) {
    console.error('[Admin] exclusão de empresa falhou', { organizationId: organization.id, message: error.message });
    return fail(409, `O banco não permitiu excluir a empresa: ${error.message}`);
  }
  console.info('[Admin] empresa excluída', { organizationId: organization.id, by: auth.userId, filesRemoved });
  return NextResponse.json({ deleted: true, filesRemoved });
}
