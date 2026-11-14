'use client';

import { Compass, CreditCard, ExternalLink, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { TOUR_EVENT } from '@/lib/onboarding';
import { TrialNotice } from '@/components/trial-notice';
import { AiUsageNotice } from '@/components/ai-usage-notice';
import { canAccess, ROLE_INFO, type Role } from '@/lib/team';

/**
 * Rodapé do menu lateral do workspace (fundo escuro): avisos (teste gratuito, uso da IA), links da conta,
 * papel da pessoa e saída. "Plano e assinatura" só para dono/admin; o atalho do Console só para o Super Admin.
 */
export function SidebarFooter({ organizationId, role, superAdmin, onSignOut }: {
  organizationId?: string | null;
  role?: Role | null;
  superAdmin?: boolean;
  onSignOut?: () => void;
}) {
  const link = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-[#B9BBE0] transition hover:bg-white/[.06] hover:text-white';
  const manager = canAccess(role, 'relatorios');
  const signOutClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-[#B9BBE0] transition hover:bg-rose-500/10 hover:text-rose-200';

  return <div className="mt-auto space-y-3 pt-6">
    <TrialNotice organizationId={organizationId} dark />
    {manager && <AiUsageNotice organizationId={organizationId} compact dark />}
    <div className="space-y-0.5 border-t border-white/[.08] pt-3">
      {canAccess(role, 'assinatura') && <a href={organizationId ? `/assinatura?organization=${organizationId}` : '/assinatura'} className={link}><CreditCard size={15} />Plano e assinatura</a>}
      <a href={organizationId ? `/conta?organization=${organizationId}` : '/conta'} className={link}><UserRound size={15} />Minha conta</a>
      <a href="/" target="_blank" rel="noopener" className={link}><ExternalLink size={15} />Ver site do TendiDesk</a>
      {superAdmin && <a href="/admin" className={link}><ShieldCheck size={15} className="text-[#F27AD3]" />Console Super Admin</a>}
      {onSignOut
        ? <button type="button" onClick={onSignOut} className={signOutClass}><LogOut size={15} />Sair da conta</button>
        : <form action="/auth/signout" method="post"><button className={signOutClass}><LogOut size={15} />Sair da conta</button></form>}
    </div>
    {role && <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[.04] px-3 py-2 ring-1 ring-inset ring-white/[.06]">
      {!superAdmin ? <p className="min-w-0 truncate text-[11px] text-[#8E91C4]">Perfil <b className="font-semibold text-white">{ROLE_INFO[role].label}</b></p> : <span className="text-[11px] text-[#8E91C4]">Super Admin</span>}
      <button type="button" data-tour="tour-restart" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))} title="Rever o guia de primeiros passos" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-tendi-magenta/15 px-2 py-1 text-[10.5px] font-semibold text-[#F7A8E2] ring-1 ring-inset ring-tendi-magenta/30 transition hover:bg-tendi-magenta/25 hover:text-white"><Compass size={11} />Primeiros passos</button>
    </div>}
  </div>;
}
