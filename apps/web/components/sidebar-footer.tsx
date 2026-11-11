'use client';

import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { TrialNotice } from '@/components/trial-notice';
import { AiUsageNotice } from '@/components/ai-usage-notice';
import { canAccess, ROLE_INFO, type Role } from '@/lib/team';

/**
 * Rodapé do menu lateral do workspace: avisos (teste gratuito, uso da IA), papel da pessoa e links.
 * "Plano e assinatura" só para dono/admin; o atalho do Console só para o Super Admin.
 */
export function SidebarFooter({ organizationId, role, superAdmin, onSignOut }: {
  organizationId?: string | null;
  role?: Role | null;
  superAdmin?: boolean;
  onSignOut?: () => void;
}) {
  const link = 'flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#2F316B] hover:bg-slate-50';
  const manager = canAccess(role, 'relatorios');

  return <div className="mt-auto space-y-2 px-2">
    <TrialNotice organizationId={organizationId} />
    {manager && <AiUsageNotice organizationId={organizationId} compact />}
    {canAccess(role, 'assinatura') && <a href={organizationId ? `/assinatura?organization=${organizationId}` : '/assinatura'} className={link}><CreditCard size={15} className="text-[#004751]" />Plano e assinatura</a>}
    <a href="/" target="_blank" rel="noopener" className={link}><ExternalLink size={15} className="text-[#004751]" />Ver site do Tendi</a>
    {superAdmin && <a href="/admin" className={link}><ShieldCheck size={15} className="text-[#CB0A9F]" />Console Super Admin</a>}
    {role && !superAdmin && <p className="px-2 text-[10px] text-slate-400">Você entrou como <b className="text-slate-500">{ROLE_INFO[role].label}</b></p>}
    {onSignOut
      ? <button onClick={onSignOut} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button>
      : <form action="/auth/signout" method="post"><button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button></form>}
  </div>;
}
