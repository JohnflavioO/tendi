import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
type Context = { params: { organizationId: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['requested','proposal_approved','awaiting_payment','paid_awaiting_setup','awaiting_meta_validation','active'] as const;
type Status = typeof statuses[number];
const next: Record<Status,Status|null> = {
 requested:'proposal_approved',proposal_approved:'awaiting_payment',
 awaiting_payment:'paid_awaiting_setup',paid_awaiting_setup:'awaiting_meta_validation',
 awaiting_meta_validation:'active',active:null,
};
const fail=(status:number,error:string)=>NextResponse.json({error},{status});

export async function GET(_request:Request,{params}:Context){
 const auth=await requireSuperAdmin();if(!auth.ok)return auth.response;
 if(!UUID.test(params.organizationId))return fail(400,'Workspace inválido.');
 const [state,history,billing]=await Promise.all([
  auth.admin.from('business_onboardings').select('*').eq('organization_id',params.organizationId).maybeSingle(),
  auth.admin.from('business_onboarding_events').select('from_status,to_status,actor_user_id,notes,created_at').eq('organization_id',params.organizationId).order('created_at',{ascending:false}).limit(30),
  auth.admin.from('billing_subscriptions').select('status,plan_code,last_event_type,provider_subscription_id').eq('organization_id',params.organizationId).maybeSingle(),
 ]);
 if(state.error||history.error||billing.error)return fail(503,'Dados de contratação indisponíveis. Verifique a migration.');
 return NextResponse.json({onboarding:state.data,events:history.data??[],billing:billing.data});
}

export async function PATCH(request:Request,{params}:Context){
 const auth=await requireSuperAdmin();if(!auth.ok)return auth.response;
 if(!UUID.test(params.organizationId))return fail(400,'Workspace inválido.');
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 const action=body?.action;
 if(action!=='create'&&action!=='advance')return fail(400,'Ação inválida.');
 const org=await auth.admin.from('organizations').select('id,plan_code').eq('id',params.organizationId).maybeSingle();
 if(org.error||!org.data)return fail(404,'Empresa não encontrada.');
 const current=await auth.admin.from('business_onboardings').select('*').eq('organization_id',params.organizationId).maybeSingle();
 if(current.error)return fail(503,'Contratação indisponível.');
 if(action==='create'){
  if(current.data)return fail(409,'Já existe solicitação Business para esta empresa.');
  const monthly=body?.monthlyCents,setup=body?.setupCents,source=body?.numberSource;
  if(!Number.isSafeInteger(monthly)||Number(monthly)<=0||!Number.isSafeInteger(setup)||Number(setup)<0||!['customer','tendidesk'].includes(String(source)))return fail(400,'Informe valores em centavos e origem do número.');
  const inserted=await auth.admin.from('business_onboardings').insert({
   organization_id:params.organizationId,status:'requested',proposed_monthly_cents:monthly,setup_fee_cents:setup,number_source:source,
   proposal_notes:typeof body?.notes==='string'?body.notes.slice(0,1000):null,updated_by:auth.userId,
  });
  if(inserted.error)return fail(500,'Não foi possível criar solicitação.');
  await auth.admin.from('business_onboarding_events').insert({organization_id:params.organizationId,to_status:'requested',actor_user_id:auth.userId});
  return NextResponse.json({status:'requested'});
 }
 if(!current.data)return fail(404,'Crie a solicitação antes de avançar.');
 const from=current.data.status as Status;
 const target=next[from];
 if(!target||body?.toStatus!==target)return fail(409,'Transição não permitida. Avance uma etapa por vez.');
 if(target==='paid_awaiting_setup'){
  // Um webhook subscription.created não comprova pagamento.
  const bill=await auth.admin.from('billing_subscriptions').select('status,plan_code,last_event_type,provider_subscription_id').eq('organization_id',params.organizationId).maybeSingle();
  if(current.data.setup_payment_status!=='paid'&&current.data.setup_payment_status!=='waived')return fail(409,'Implantação avulsa ainda não paga. Confirme o pedido Pagar.me ou registre isenção justificada.');
  if(bill.error||bill.data?.status!=='active'||bill.data?.plan_code!=='tendi_business'||!['invoice.paid','charge.paid'].includes(bill.data?.last_event_type??'')||!bill.data?.provider_subscription_id){
   return fail(409,'Pagamento Business não confirmado pela Pagar.me. Vincule o plano Business e aguarde invoice.paid ou charge.paid.');
  }
 }
 if(target==='active'){
  const approval=await auth.admin.from('whatsapp_official_approvals').select('approved,billing_verified').eq('organization_id',params.organizationId).maybeSingle();
  if(approval.error||approval.data?.approved!==true||approval.data?.billing_verified!==true)return fail(409,'Validação financeira e aprovação Meta ainda pendentes.');
  if(org.data.plan_code!=='tendi_business')return fail(409,'O workspace ainda não está no plano Business.');
 }
 const now=new Date().toISOString();
 const patch:Record<string,unknown>={status:target,updated_at:now,updated_by:auth.userId};
 if(target==='paid_awaiting_setup'){patch.payment_verified_at=now;patch.payment_verified_by=auth.userId;}
 const saved=await auth.admin.from('business_onboardings').update(patch).eq('organization_id',params.organizationId).eq('status',from).select('status').maybeSingle();
 if(saved.error||!saved.data)return fail(409,'A etapa foi alterada por outra operação. Atualize a página.');
 await auth.admin.from('business_onboarding_events').insert({organization_id:params.organizationId,from_status:from,to_status:target,actor_user_id:auth.userId});
 return NextResponse.json({status:target});
}
