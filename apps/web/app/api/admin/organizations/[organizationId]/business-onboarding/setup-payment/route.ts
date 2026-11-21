import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { createPagarmeClient } from '@/lib/pagarme';
import { getPlatformSecret } from '@/lib/billing';
import { buildSetupPaymentLink, confirmSetupOrder, setupOrderCode } from '@/lib/business-setup-payment';

export const dynamic='force-dynamic';
type Context={params:{organizationId:string}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(code:number,error:string)=>NextResponse.json({error},{status:code});

export async function POST(request:Request,{params}:Context){
 const auth=await requireSuperAdmin();if(!auth.ok)return auth.response;
 const id=params.organizationId;if(!UUID.test(id))return fail(400,'Workspace inválido.');
 const body=await request.json().catch(()=>null) as {action?:string;orderId?:string;reason?:string}|null;
 const current=await auth.admin.from('business_onboardings').select('*').eq('organization_id',id).maybeSingle();
 if(current.error||!current.data)return fail(404,'Solicitação Business não encontrada.');
 const row=current.data;
 if(row.setup_payment_status==='paid'||row.setup_payment_status==='waived')return fail(409,'Implantação já quitada ou isenta.');
 if(!['awaiting_payment','proposal_approved'].includes(row.status))return fail(409,'A proposta deve estar aprovada para cobrar implantação.');
 const amount=Number(row.setup_fee_cents);
 if(!Number.isSafeInteger(amount)||amount<0)return fail(409,'Valor de implantação inválido.');
 if(body?.action==='waive'){
  const reason=body.reason?.trim();
  if(!reason||reason.length<12||reason.length>500)return fail(400,'Informe motivo de isenção (12 a 500 caracteres).');
  const saved=await auth.admin.from('business_onboardings').update({setup_payment_status:'waived',setup_waived_by:auth.userId,setup_waived_reason:reason,updated_at:new Date().toISOString()}).eq('organization_id',id).in('setup_payment_status',['not_created','pending','refunded']).select('organization_id').maybeSingle();
  if(saved.error||!saved.data)return fail(409,'Não foi possível conceder isenção.');
  await auth.admin.from('business_onboarding_events').insert({organization_id:id,from_status:row.status,to_status:row.status,actor_user_id:auth.userId,notes:'Implantação isenta: '+reason});
  return NextResponse.json({status:'waived'});
 }
 const key=await getPlatformSecret(auth.admin,'pagarme_secret_key');
 if(!key)return fail(503,'Chave Pagar.me não configurada.');
 const api=createPagarmeClient(key);
 if(body?.action==='verify'){
  if(!row.setup_payment_link_id||!row.setup_payment_order_code)return fail(409,'Gere o link de implantação antes de verificar.');
  const orderId=body.orderId?.trim()??'';
  if(!/^or_[a-zA-Z0-9]+$/.test(orderId))return fail(400,'Informe o ID do pedido Pagar.me (or_...).');
  const valid=await confirmSetupOrder(api,orderId,{organizationId:id,amountCents:amount,orderCode:row.setup_payment_order_code}).catch(()=>false);
  if(!valid)return fail(409,'Pedido não pago ou não corresponde ao workspace, finalidade e valor da implantação.');
  const saved=await auth.admin.from('business_onboardings').update({setup_payment_status:'paid',setup_payment_order_id:orderId,setup_paid_at:new Date().toISOString(),setup_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('organization_id',id).eq('setup_payment_status','pending').select('organization_id').maybeSingle();
  if(saved.error||!saved.data)return fail(409,'A cobrança mudou de estado. Atualize a página.');
  await auth.admin.from('business_onboarding_events').insert({organization_id:id,from_status:row.status,to_status:row.status,actor_user_id:auth.userId,notes:'Pagamento avulso confirmado na API Pagar.me: '+orderId});
  return NextResponse.json({status:'paid'});
 }
 if(body?.action!=='create')return fail(400,'Ação inválida.');
 if(amount===0)return fail(409,'Implantação de valor zero: use isenção justificada.');
 if(row.setup_payment_status==='pending'&&row.setup_payment_url)return NextResponse.json({status:'pending',url:row.setup_payment_url});
 if(row.setup_payment_link_id)return fail(409,'Cobrança anterior existente. Reconcilie antes de gerar outra.');
 const org=await auth.admin.from('organizations').select('name').eq('id',id).maybeSingle();
 if(!org.data)return fail(404,'Empresa não encontrada.');
 const origin=process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,'')||new URL(request.url).origin;
 const code=setupOrderCode(id);
 try{
  const link=await api<{id?:string;url?:string}>('/paymentlinks',{method:'POST',body:buildSetupPaymentLink({organizationId:id,organizationName:org.data.name,amountCents:amount,customerName:org.data.name,customerEmail:null,successUrl:`${origin}/assinatura?organization=${id}&setup=retorno`})});
  if(!link.id||!link.url)return fail(502,'Pagar.me não retornou o link de implantação.');
  const saved=await auth.admin.from('business_onboardings').update({setup_payment_link_id:link.id,setup_payment_url:link.url,setup_payment_order_code:code,setup_payment_status:'pending',updated_at:new Date().toISOString()}).eq('organization_id',id).eq('setup_payment_status','not_created').select('organization_id').maybeSingle();
  if(saved.error||!saved.data)return fail(409,'Cobrança criada na Pagar.me, mas não vinculada. NÃO gere outra; concilie pelo suporte.');
  await auth.admin.from('business_onboarding_events').insert({organization_id:id,from_status:row.status,to_status:row.status,actor_user_id:auth.userId,notes:'Link avulso de implantação criado: '+link.id});
  return NextResponse.json({status:'pending',url:link.url});
 }catch(error){
  console.error('[Business setup link]',error instanceof Error?error.message:'unknown');
  return fail(502,'Não foi possível gerar a cobrança na Pagar.me.');
 }
}
