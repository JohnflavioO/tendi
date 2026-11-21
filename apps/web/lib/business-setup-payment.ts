import type { PagarmeRequest } from './pagarme';

type RecordValue = Record<string, unknown>;
const object = (v:unknown): v is RecordValue => !!v && typeof v==='object' && !Array.isArray(v);
const string = (v:unknown):string|null => typeof v==='string' && v.trim()?v.trim():null;

export function setupOrderCode(organizationId:string):string {
  return `TENDI-SETUP-${organizationId}`;
}
export function buildSetupPaymentLink(input:{organizationId:string;organizationName:string;amountCents:number;customerName:string;customerEmail:string|null;successUrl:string}){
  return {
    name:`Implantação Business · ${input.organizationName}`.slice(0,64),
    type:'order',order_code:setupOrderCode(input.organizationId),
    max_paid_sessions:1,expires_in:24*60,
    payment_settings:{accepted_payment_methods:['credit_card'],statement_descriptor:'TENDI',credit_card_settings:{operation_type:'auth_and_capture'}},
    cart_settings:{items:[{name:'Implantação TendiDesk Business',amount:input.amountCents,quantity:1}]},
    customer_settings:{customer:{name:input.customerName.slice(0,64),...(input.customerEmail?{email:input.customerEmail.slice(0,64)}:{}),code:input.organizationId}},
    flow_settings:{success_url:input.successUrl},
  };
}

/** Nunca confia apenas no webhook: valida o pedido consultado diretamente na Pagar.me. */
export function verifySetupOrder(order:unknown, expected:{organizationId:string;amountCents:number;orderCode:string}):boolean{
  if(!object(order)||order.status!=='paid'||order.code!==expected.orderCode)return false;
  const customer=object(order.customer)?order.customer:{};
  if(customer.code!==expected.organizationId)return false;
  const items=Array.isArray(order.items)?order.items:[];
  const total=items.reduce((sum:number,item:unknown)=>{
    if(!object(item))return NaN;
    const amount=Number(item.amount),quantity=Number(item.quantity);
    return sum+(Number.isSafeInteger(amount)&&Number.isSafeInteger(quantity)?amount*quantity:NaN);
  },0);
  return Number.isSafeInteger(total)&&total===expected.amountCents && Number(order.amount)===expected.amountCents;
}
export async function confirmSetupOrder(api:PagarmeRequest,orderId:string,expected:{organizationId:string;amountCents:number;orderCode:string}){
  if(!/^or_[a-zA-Z0-9]+$/.test(orderId))return false;
  const order=await api(`/orders/${encodeURIComponent(orderId)}`);
  return verifySetupOrder(order,expected);
}
export function setupEventOrderId(payload:unknown):string|null{
  if(!object(payload)||!['order.paid','order.payment_failed','order.canceled','order.refunded','charge.refunded'].includes(String(payload.type)))return null;
  const data=object(payload.data)?payload.data:{};
  const id=string(data.id);
  const nested=object(data.order)?string(data.order.id):null;
  const orderId=payload.type==='charge.refunded'?nested:id;
  return orderId&&/^or_[a-zA-Z0-9]+$/.test(orderId)?orderId:null;
}
