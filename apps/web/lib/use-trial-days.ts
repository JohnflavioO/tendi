'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_TRIAL_DAYS, normalizeTrialDays } from './trial';

/** Prazo do teste gratuito para telas client-side (login e cadastro). */
export function useTrialDays(): number {
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = createClient() as any;
        const { data, error } = await supabase.rpc('get_trial_days');
        if (active && !error) setTrialDays(normalizeTrialDays(data));
      } catch {
        // Mantém o padrão quando a configuração não puder ser lida.
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return trialDays;
}
