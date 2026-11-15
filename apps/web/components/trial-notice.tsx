'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { trialDaysLabel, trialDaysLeft } from '@/lib/trial';

/** Aviso de dias restantes do teste gratuito. Não aparece para empresas fora do período de teste. */
export function TrialNotice({ organizationId, dark = false }: { organizationId?: string | null; dark?: boolean }) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setDaysLeft(null);
    if (!organizationId) return;
    async function load() {
      const supabase = createClient() as any;
      const { data } = await supabase
        .from('organizations')
        .select('status,trial_ends_at')
        .eq('id', organizationId)
        .maybeSingle();
      if (active && data) setDaysLeft(trialDaysLeft(data));
    }
    void load().catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);

  if (daysLeft === null) return null;

  const urgent = daysLeft <= 2;
  const message = daysLeft === 0
    ? 'Seu teste termina hoje'
    : `${daysLeft === 1 ? 'Falta' : 'Faltam'} ${trialDaysLabel(daysLeft)}`;

  const href = `/assinatura?organization=${organizationId}`;
  // Versão do menu lateral escuro.
  if (dark) return (
    <div role="status" className="rounded-xl bg-white/[.06] p-3 text-xs text-white ring-1 ring-inset ring-white/10">
      <p className="flex items-center gap-2 font-semibold"><span className={`size-1.5 rounded-full ${urgent ? 'bg-rose-400' : 'bg-amber-300'}`} />Teste gratuito</p>
      <p className="mt-1 text-[#B9BBE0]">{message}</p>
      <Link href={href} className="mt-2.5 inline-flex h-7 items-center rounded-lg bg-white px-2.5 text-[11px] font-semibold text-tendi-navy transition hover:bg-tendi-mist">Assinar agora</Link>
    </div>
  );

  return (
    <div role="status" className={`rounded-xl border p-3 text-xs ${urgent ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <p className="flex items-center gap-2 font-semibold"><Clock3 size={14}/>Teste gratuito</p>
      <p className="mt-1">{message}</p>
      <Link href={href} className="mt-2 inline-block font-semibold underline">Assinar agora</Link>
    </div>
  );
}
