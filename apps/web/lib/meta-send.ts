import type { SupabaseClient } from '@supabase/supabase-js';
import { sendInstagramText, sendMessengerText } from './meta-client';
import type { MetaSendFn } from './inbox-send';

/**
 * Envio de texto pelo Instagram ou Messenger em nome da empresa. O token da página fica no Vault
 * e só sai com a chave de serviço (get_channel_secret): `admin` precisa ser o cliente de serviço.
 * Usado pelo Inbox (resposta do atendente) e pela resposta automática da IA no Instagram.
 */
export function createMetaSender(admin: SupabaseClient<any, any, any>): MetaSendFn {
  return async ({ channel, connectionId, accountId, recipientId, text }) => {
    const { data: token, error } = await admin.rpc('get_channel_secret', { p_connection_id: connectionId });
    // "access token" no texto faz friendlyMetaSendError pedir para reconectar.
    if (error || typeof token !== 'string' || !token) throw new Error('Token da conexão não encontrado (access token). Reconecte em Conexões.');
    return channel === 'instagram'
      ? sendInstagramText(token, accountId, recipientId, text)
      : sendMessengerText(token, recipientId, text);
  };
}
