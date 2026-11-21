import {describe,it,expect} from 'vitest';
import {canViewPrivateContact,canViewPrivateConversation,canAuthorizePortfolioTransfer} from './sales-portfolio';
const base={enabled:true,role:'agent' as const,userId:'seller-a',ownerId:'seller-a',assignedTo:'seller-a'};
describe('private sales portfolio access',()=>{
 it('keeps existing shared workspaces unchanged',()=>expect(canViewPrivateContact({...base,enabled:false,ownerId:'seller-b'})).toBe(true));
 it('hides another seller contact and conversation',()=>{
  expect(canViewPrivateContact({...base,ownerId:'seller-b'})).toBe(false);
  expect(canViewPrivateConversation({...base,ownerId:'seller-b'})).toBe(false);
 });
 it('allows own contact and manager oversight',()=>{
  expect(canViewPrivateContact(base)).toBe(true);
  expect(canViewPrivateConversation({...base,role:'manager',ownerId:'seller-b'})).toBe(true);
 });
 it('preserves unassigned queue and restricts reassignment',()=>{
  expect(canViewPrivateConversation({...base,ownerId:null,assignedTo:null})).toBe(true);
  expect(canViewPrivateConversation({...base,ownerId:null,assignedTo:'seller-b'})).toBe(false);
  expect(canAuthorizePortfolioTransfer('agent','seller-a','seller-b')).toBe(false);
  expect(canAuthorizePortfolioTransfer('manager','seller-a','seller-b')).toBe(true);
 });
});
