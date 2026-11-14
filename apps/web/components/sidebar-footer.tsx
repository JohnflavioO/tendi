'use client';

import { Compass, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { TOUR_EVENT } from '@/lib/onboarding';
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
    <a href="/" target="_blank" rel="noopener" className={link}><ExternalLink size={15} className="text-[#004751]" />Ver site do TendiDesk</a>
    {superAdmin && <a href="/admin" className={link}><ShieldCheck size={15} className="text-[#CB0A9F]" />Console Super Admin</a>}
    {role && <div className="flex items-center justify-between gap-2 px-2">
      {!superAdmin ? <p className="truncate text-[10px] text-slate-400">Logado como <b className="text-slate-500">{ROLE_INFO[role].label}</b></p> : <span />}
      <button type="button" data-tour="tour-restart" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))} title="Rever o guia de primeiros passos" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#F3C9EA] bg-[#FDF2FB] px-2 py-1 text-[10px] font-semibold text-[#CB0A9F] transition hover:bg-[#FCEAF7]"><Compass size={11} />Primeiros passos</button>
    </div>}
    {onSignOut
      ? <button onClick={onSignOut} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button>
      : <form action="/auth/signout" method="post"><button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button></form>}
  </div>;
}
