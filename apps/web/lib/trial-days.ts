import { DEFAULT_TRIAL_DAYS, normalizeTrialDays } from './trial';

/**
 * Prazo do teste gratuito configurado no Console Super Admin, para uso em
 * Server Components públicos. Em qualquer falha (sem variáveis, rede, função
 * ainda não criada) devolve o padrão, para o site nunca quebrar por isso.
 */
export async function getTrialDays(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return DEFAULT_TRIAL_DAYS;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/get_trial_days`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 300 },
    });
    if (!response.ok) return DEFAULT_TRIAL_DAYS;
    return normalizeTrialDays(await response.json());
  } catch {
    return DEFAULT_TRIAL_DAYS;
  }
}
