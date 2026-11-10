'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { trialDaysLabel, trialDaysLeft } from '@/lib/trial';

/** Aviso de dias restantes do teste gratuito. Não aparece para empresas fora do período de teste. */
export function TrialNotice({ organizationId }: { organizationId?: string | null }) {
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

  return (
    <div role="status" className={`rounded-xl border p-3 text-xs ${urgent ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <p className="flex items-center gap-2 font-semibold"><Clock3 size={14}/>Teste gratuito</p>
      <p className="mt-1">{message}</p>
      <a href="mailto:suporte@tendi.app?subject=Quero%20assinar%20o%20Tendi" className="mt-2 inline-block font-semibold underline">Falar sobre a assinatura</a>
    </div>
  );
}
