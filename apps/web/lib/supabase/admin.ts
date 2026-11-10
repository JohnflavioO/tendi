import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com a chave de serviço: ignora as regras de acesso (RLS).
 * Use SOMENTE no servidor e SOMENTE depois de validar o usuário com o cliente normal.
 * Retorna null quando a chave não está configurada.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
