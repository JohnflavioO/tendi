import type { Database } from '@/lib/database.types';
import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Configuração do Supabase ausente.');
  if (!browserClient) browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
