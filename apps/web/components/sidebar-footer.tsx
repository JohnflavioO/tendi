'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TrialNotice } from '@/components/trial-notice';
import { AiUsageNotice } from '@/components/ai-usage-notice';

/**
 * Rodapé do menu lateral do workspace: avisos (teste gratuito, uso da IA) e links.
 * O atalho do Console aparece só para o Super Admin; clientes não veem.
 */
export function SidebarFooter({ organizationId, onSignOut }: { organizationId?: string | null; onSignOut?: () => void }) {
  const [superAdmin, setSuperAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient() as any;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (active) setSuperAdmin(Boolean(data));
    })().catch(() => undefined);
    return () => { active = false; };
  }, []);

  const link = 'flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#2F316B] hover:bg-slate-50';

  return <div className="mt-auto space-y-2 px-2">
    <TrialNotice organizationId={organizationId} />
    <AiUsageNotice organizationId={organizationId} compact />
    <a href={organizationId ? `/assinatura?organization=${organizationId}` : '/assinatura'} className={link}><CreditCard size={15} className="text-[#004751]" />Plano e assinatura</a>
    <a href="/" target="_blank" rel="noopener" className={link}><ExternalLink size={15} className="text-[#004751]" />Ver site do Tendi</a>
    {superAdmin && <a href="/admin" className={link}><ShieldCheck size={15} className="text-[#CB0A9F]" />Console Super Admin</a>}
    {onSignOut
      ? <button onClick={onSignOut} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button>
      : <form action="/auth/signout" method="post"><button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-500 transition hover:bg-slate-50">Sair da conta</button></form>}
  </div>;
}
