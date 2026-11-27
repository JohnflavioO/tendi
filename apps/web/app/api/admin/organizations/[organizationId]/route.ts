import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { DapiError, dapiRequest, repointDapiSessionWebhook } from '@/lib/dapi';
import { sessionIdFor, settingsForType } from '@/lib/whatsapp-session';
import { MEDIA_BUCKET } from '@/lib/inbox-attachments';
import { confirmsDeletion, isInternalOrganization, statusAfterReactivation } from '@/lib/company-control';
import {
  COMPLIMENTARY_COLUMNS, grantComplimentaryPatch, hasComplimentary, isChargingSubscription, isComplimentaryActive,
  parseComplimentaryInput, revokeComplimentaryPatch, type PlanChangeAction,
} from '@/lib/complimentary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Context = { params: { organizationId: string } };
type Admin = Extract<Awaited<ReturnType<typeof requireSuperAdmin>>, { ok: true }>['admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

async function loadOrganization(admin: Admin, organizationId: string) {
  if (!UUID_RE.test(organizationId)) return null;
  const { data } = await admin.from('organizations').select(`id,name,slug,status,plan_code,trial_ends_at,${COMPLIMENTARY_COLUMNS}`).eq('id', organizationId).maybeSingle();
  return data as {
    id: string; name: string; slug: string; status: string; plan_code: string | null; trial_ends_at: string | null;
    complimentary_since: string | null; complimentary_until: string | null; complimentary_reason: string | null; complimentary_by: string | null;
  } | null;
}

async function loadSubscriptionStatus(admin: Admin, organizationId: string): Promise<string | null> {
  const { data } = await admin.from('billing_subscriptions').select('status').eq('organization_id', organizationId).maybeSingle();
  return (data as { status?: string } | null)?.status ?? null;
}

async function planExists(admin: Admin, planCode: string): Promise<boolean> {
  if (!planCode) return false;
  const { data } = await admin.from('subscription_plans').select('code').eq('code', planCode).maybeSingle();
  return Boolean(data);
}

/** Registra no histórico quem mudou o plano ou a cortesia, e quando. Uma falha aqui não desfaz a mudança. */
async function logPlanChange(admin: Admin, entry: {
  organizationId: string; action: PlanChangeAction; fromPlan: string | null; toPlan: string | null;
  until?: string | null; reason?: string | null; actorUserId: string;
}) {
  const { error } = await admin.from('organization_plan_changes').insert({
    organization_id: entry.organizationId,
    action: entry.action,
    from_plan_code: entry.fromPlan,
    to_plan_code: entry.toPlan,
    complimentary_until: entry.until ?? null,
    reason: entry.reason ?? null,
    actor_user_id: entry.actorUserId,
  });
  if (error) console.error('[Admin] histórico de plano não gravado', { organizationId: entry.organizationId, action: entry.action, message: error.message });
}

/**
 * PATCH /api/admin/organizations/<id>
 *   { action: 'suspend' }      bloqueia o acesso da empresa (os dados ficam guardados)
 *   { action: 'reactivate' }   libera de novo
 *   { action: 'set_plan', planCode }                          troca o plano sem cobrança (fica no histórico)
 *   { action: 'grant_complimentary', planCode, until?, reason } conta cortesia: liberada sem pagamento
 *   { action: 'revoke_complimentary' }                         volta ao fluxo normal de assinatura
 *   { action: 'prepare_official_whatsapp' }                    reserva a sessão do WhatsApp oficial (API da Meta)
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
    // Cortesia valendo conta como "em dia": a empresa volta ativa.
    const status = statusAfterReactivation({ trialEndsAt: organization.trial_ends_at, hasActiveSubscription: Boolean(subscription) || isComplimentaryActive(organization) });
    const { error } = await auth.admin.from('organizations').update({ status }).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível reativar: ${error.message}`);
    return NextResponse.json({ status });
  }

  if (action === 'set_plan') {
    const planCode = typeof body?.planCode === 'string' ? body.planCode.trim() : '';
    if (!(await planExists(auth.admin, planCode))) return fail(400, 'Plano inválido.');
    if (planCode === organization.plan_code) return NextResponse.json({ planCode, unchanged: true });
    const { error } = await auth.admin.from('organizations').update({ plan_code: planCode }).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível trocar o plano: ${error.message}`);
    await logPlanChange(auth.admin, { organizationId: organization.id, action: 'plan_changed', fromPlan: organization.plan_code, toPlan: planCode, actorUserId: auth.userId });
    // Quem paga pela Pagar.me segue cobrado no plano da assinatura: a próxima cobrança traz o plano de volta.
    const charging = isChargingSubscription(await loadSubscriptionStatus(auth.admin, organization.id));
    return NextResponse.json({ planCode, subscriptionWillOverride: charging && !isComplimentaryActive(organization) });
  }

  if (action === 'grant_complimentary') {
    const parsed = parseComplimentaryInput(body);
    if (!parsed.ok) return fail(400, parsed.error);
    if (!(await planExists(auth.admin, parsed.value.planCode))) return fail(400, 'Plano inválido.');
    if (isChargingSubscription(await loadSubscriptionStatus(auth.admin, organization.id))) {
      return fail(409, 'Esta empresa tem uma assinatura cobrando na Pagar.me. Cancele a assinatura antes de liberar a cortesia, para ela não ser cobrada.');
    }
    const wasActive = isComplimentaryActive(organization);
    const patch = grantComplimentaryPatch(parsed.value, organization, auth.userId);
    const { error } = await auth.admin.from('organizations').update(patch).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível liberar a cortesia: ${error.message}`);
    await logPlanChange(auth.admin, {
      organizationId: organization.id, action: wasActive ? 'complimentary_updated' : 'complimentary_granted',
      fromPlan: organization.plan_code, toPlan: parsed.value.planCode, until: parsed.value.until, reason: parsed.value.reason, actorUserId: auth.userId,
    });
    return NextResponse.json({ complimentary: { since: patch.complimentary_since, until: patch.complimentary_until, planCode: patch.plan_code } });
  }

  if (action === 'revoke_complimentary') {
    if (!hasComplimentary(organization)) return fail(409, 'Esta empresa não é uma conta cortesia.');
    const subscriptionStatus = await loadSubscriptionStatus(auth.admin, organization.id);
    const patch = revokeComplimentaryPatch({ trialEndsAt: organization.trial_ends_at, hasActiveSubscription: isChargingSubscription(subscriptionStatus) });
    const { error } = await auth.admin.from('organizations').update(patch).eq('id', organization.id);
    if (error) return fail(500, `Não foi possível revogar a cortesia: ${error.message}`);
    await logPlanChange(auth.admin, { organizationId: organization.id, action: 'complimentary_revoked', fromPlan: organization.plan_code, toPlan: organization.plan_code, actorUserId: auth.userId });
    return NextResponse.json({ status: patch.status, trialEndsAt: patch.trial_ends_at });
  }

  if (action === 'set_official_whatsapp_approval') {
    // O workspace interno da plataforma (slug 'tendi') nunca passa pelo fluxo comercial de
    // implantação Business (proposta, taxa de setup, validação Meta) — não tem por que ter: não é
    // um cliente pagante. Exigir isso dele deixaria a aprovação permanentemente impossível.
    if (body?.approved === true && !isInternalOrganization(organization)) {
      const onboarding = await auth.admin.from('business_onboardings').select('status,payment_verified_at').eq('organization_id', organization.id).maybeSingle();
      if (onboarding.error || !onboarding.data?.payment_verified_at || !['awaiting_meta_validation','active'].includes(onboarding.data.status)) {
        return fail(409, 'Conclua o pagamento e avance a implantação Business até a validação Meta antes de aprovar.');
      }
    }
    if (organization.plan_code !== 'tendi_business' && body?.approved === true) {
      return fail(409, 'Selecione o plano Business antes de aprovar a API oficial.');
    }
    const approved = body?.approved === true;
    const billingVerified = approved && body?.billingVerified === true;
    if (approved && !billingVerified) return fail(409, 'Confirme primeiro a responsabilidade financeira do cliente na Meta.');
    const { error } = await auth.admin.from('whatsapp_official_approvals').upsert({
      organization_id: organization.id,
      approved,
      billing_verified: billingVerified,
      approved_by: approved ? auth.userId : null,
      approved_at: approved ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });
    if (error) return fail(500, 'Não foi possível atualizar a aprovação. Confira se a migration Business foi aplicada.');
    return NextResponse.json({ approved, billingVerified });
  }

  if (action === 'sync_whatsapp_webhook') {
    // Reservar a sessão (ação acima) só grava o código localmente; quem cria a conexão de verdade
    // no provedor é o suporte, pelo painel do On Connect. Depois disso o provedor ainda não sabe
    // para onde mandar os eventos dessa sessão — é isso que esta ação corrige.
    const { data: row, error: readError } = await auth.admin.from('channel_connections')
      .select('provider_account_id').eq('organization_id', organization.id).eq('channel', 'whatsapp').maybeSingle();
    if (readError) return fail(500, `Não foi possível consultar a conexão: ${readError.message}`);
    const sessionId = (row as { provider_account_id: string | null } | null)?.provider_account_id;
    if (!sessionId) return fail(409, 'Reserve a sessão antes de sincronizar o webhook.');
    try {
      await repointDapiSessionWebhook(sessionId);
    } catch (error) {
      const message = error instanceof DapiError && error.status === 404
        ? 'Sessão não encontrada no provedor. Confirme que ela já foi criada no painel do On Connect com este código.'
        : error instanceof Error ? error.message.slice(0, 200) : 'Falha ao sincronizar o webhook.';
      return fail(502, message);
    }
    return NextResponse.json({ synced: true });
  }

  if (action === 'prepare_official_whatsapp') {
    // Reserva a conexão do WhatsApp do workspace com o código de sessão estável, para o
    // TendiDesk aceitar as mensagens dessa sessão assim que o número oficial for ligado no
    // On Connect. Uma conexão por QR Code que já existe fica como está: o On Connect a
    // substitui, e o tipo (oficial) é atualizado quando o provedor informar.
    const { data: existing, error: readError } = await auth.admin.from('channel_connections')
      .select('id,provider_account_id').eq('organization_id', organization.id).eq('channel', 'whatsapp').maybeSingle();
    if (readError) return fail(500, `Não foi possível consultar a conexão: ${readError.message}`);
    const row = existing as { id: string; provider_account_id: string | null } | null;
    const sessionId = sessionIdFor(organization.id, row?.provider_account_id);
    if (!row) {
      const { error } = await auth.admin.from('channel_connections').insert({
        organization_id: organization.id,
        channel: 'whatsapp',
        display_name: 'WhatsApp oficial · aguardando ativação',
        status: 'pending',
        provider_account_id: sessionId,
        settings: settingsForType(null, 'official'),
      });
      if (error) return fail(500, `Não foi possível reservar a conexão: ${error.message}`);
    } else if (row.provider_account_id !== sessionId) {
      const { error } = await auth.admin.from('channel_connections')
        .update({ provider_account_id: sessionId, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (error) return fail(500, `Não foi possível salvar o código da sessão: ${error.message}`);
    }
    return NextResponse.json({ sessionId, created: !row });
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
