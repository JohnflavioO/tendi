/** Dados oficiais da marca usados nas telas e nos e-mails. */
export const BRAND_DOMAIN = 'tendidesk.com.br';
export const APP_URL = 'https://tendidesk.com.br';
export const SUPPORT_EMAIL = 'suporte@tendidesk.com.br';

/**
 * Chat do site oficial (widget da empresa "Tendi" em Conexões › Webchat). A chave é pública:
 * vai no código de qualquer site que usa o widget. Trocar pela variável de ambiente, se precisar.
 */
export const SITE_WEBCHAT_KEY = process.env.NEXT_PUBLIC_SITE_WEBCHAT_KEY || 'c4ec14a7b80e47b82f7c4fab87f71a54';
