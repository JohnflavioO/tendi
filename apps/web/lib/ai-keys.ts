import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_PROVIDERS, type AiProvider } from './ai-agent';

/**
 * Chaves de API de IA.
 * Ordem: 1) chave cadastrada pelo Super Admin no painel (Supabase Vault);
 *        2) variável de ambiente do servidor (ANTHROPIC_API_KEY / OPENAI_API_KEY).
 * As funções do Vault só aceitam a chave de serviço: use sempre o cliente admin, no servidor.
 */

type Db = SupabaseClient<any, any, any>;

export type KeySource = 'painel' | 'ambiente' | null;
export type KeyStatus = { configured: boolean; source: KeySource; hint: string | null; updatedAt: string | null };

const envKey = (provider: AiProvider) => {
  const name = AI_PROVIDERS.find(item => item.value === provider)?.envKey;
  const value = name ? process.env[name]?.trim() : '';
  return value || null;
};

export const isAiProvider = (value: unknown): value is AiProvider =>
  AI_PROVIDERS.some(provider => provider.value === value);

/** Validação leve do formato, só para pegar erros de colagem (espaços, chave truncada). */
export function validateApiKey(provider: AiProvider, key: string): string | null {
  const value = key.trim();
  if (!value) return 'Cole a chave de API.';
  if (/\s/.test(value)) return 'A chave não pode ter espaços ou quebras de linha.';
  if (value.length < 20 || value.length > 400) return 'A chave parece incompleta. Copie novamente do painel do provedor.';
  if (provider === 'anthropic' && !value.startsWith('sk-ant-')) return 'Chaves da Anthropic começam com "sk-ant-".';
  if (provider === 'openai' && !value.startsWith('sk-')) return 'Chaves da OpenAI começam com "sk-".';
  return null;
}

export async function resolveProviderKey(db: Db, provider: AiProvider): Promise<string | null> {
  const { data, error } = await db.rpc('get_ai_provider_key', { p_provider: provider });
  if (!error && typeof data === 'string' && data.trim()) return data.trim();
  return envKey(provider);
}

export async function getProviderKeyStatus(db: Db): Promise<Record<AiProvider, KeyStatus>> {
  const { data } = await db.rpc('get_ai_provider_key_status');
  const rows = Array.isArray(data) ? (data as Array<{ provider: string; configured: boolean; hint: string | null; updated_at: string | null }>) : [];
  const result = {} as Record<AiProvider, KeyStatus>;
  for (const { value } of AI_PROVIDERS) {
    const row = rows.find(item => item.provider === value);
    const fromEnv = envKey(value);
    if (row?.configured) result[value] = { configured: true, source: 'painel', hint: row.hint, updatedAt: row.updated_at };
    else if (fromEnv) result[value] = { configured: true, source: 'ambiente', hint: fromEnv.slice(-4), updatedAt: null };
    else result[value] = { configured: false, source: null, hint: null, updatedAt: null };
  }
  return result;
}

export async function saveProviderKey(db: Db, provider: AiProvider, key: string | null): Promise<string | null> {
  const { error } = await db.rpc('set_ai_provider_key', { p_provider: provider, p_key: key ?? '' });
  return error ? error.message : null;
}
