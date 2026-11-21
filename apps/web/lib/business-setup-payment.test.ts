import { describe,it,expect } from 'vitest';
import { buildSetupPaymentLink, setupOrderCode, verifySetupOrder, setupEventOrderId } from './business-setup-payment';
const organizationId='637a9d9f-f621-4462-8445-dc3d2fd48304';
const expected={organizationId,amountCents:39900,orderCode:setupOrderCode(organizationId)};
const paid={id:'or_abc123',status:'paid',code:expected.orderCode,amount:39900,customer:{code:organizationId},items:[{amount:39900,quantity:1}]};
describe('Business setup payment',()=>{
 it('creates an avulsa order link with tenant-specific code and exact price',()=>{
  const p=buildSetupPaymentLink({organizationId,organizationName:'Cliente',amountCents:39900,customerName:'Cliente',customerEmail:null,successUrl:'https://example.com'});
  expect(p.type).toBe('order');expect(p.order_code).toBe(expected.orderCode);
  expect(p.cart_settings.items[0].amount).toBe(39900);
 });
 it('accepts only a paid order with exact tenant, code, amount and items',()=>{
  expect(verifySetupOrder(paid,expected)).toBe(true);
  for(const bad of [{status:'pending'},{code:'TENDI-SETUP-other'},{amount:38900},{customer:{code:'another'}},{items:[{amount:20000,quantity:1}]}]){
   expect(verifySetupOrder({...paid,...bad},expected)).toBe(false);
  }
 });
 it('extracts only supported order payment events',()=>{
  expect(setupEventOrderId({type:'order.paid',data:{id:'or_abc123'}})).toBe('or_abc123');
  expect(setupEventOrderId({type:'invoice.paid',data:{id:'or_abc123'}})).toBe(null);
 });
});
