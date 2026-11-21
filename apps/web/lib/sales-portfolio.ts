import type { Role } from './team';

/** Decisão de visibilidade reutilizável em rotas e componentes.
 * Não substitui RLS: a autorização final precisa ocorrer no banco. */
export type PortfolioAccess = {
  enabled:boolean;
  role:Role;
  userId:string;
  ownerId:string|null;
  assignedTo:string|null;
};
export function canViewPrivateContact(a:PortfolioAccess):boolean {
  if(!a.enabled)return true;
  if(a.role==='owner'||a.role==='admin'||a.role==='manager')return true;
  return a.ownerId===null || a.ownerId===a.userId;
}
export function canViewPrivateConversation(a:PortfolioAccess):boolean {
  if(!a.enabled)return true;
  if(a.role==='owner'||a.role==='admin'||a.role==='manager')return true;
  if(a.ownerId!==null)return a.ownerId===a.userId;
  return a.assignedTo===null||a.assignedTo===a.userId;
}
export function canAuthorizePortfolioTransfer(role:Role,fromUserId:string|null,toUserId:string):boolean {
  return (role==='owner'||role==='admin'||role==='manager')&&fromUserId!==toUserId;
}
export function canClaimUnassignedContact(a:PortfolioAccess):boolean {
  return a.role==='agent'&&a.ownerId===null&&a.assignedTo===null;
}
