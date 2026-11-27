-- Botões interativos do WhatsApp (opções rápidas da IA como botões nativos, via D-API) são um
-- recurso do plano Pro para cima. Start fica com a lista numerada de sempre.
-- Migração somente aditiva.

alter table public.subscription_plans add column if not exists whatsapp_buttons_enabled boolean not null default false;
update public.subscription_plans set whatsapp_buttons_enabled = true where code in ('tendi_pro', 'tendi_business');

-- Liga/desliga por workspace (dono/admin), além do que o plano permite. Começa ligado: quem já
-- está no Pro passa a usar o recurso sem precisar entrar nas configurações.
alter table public.ai_agents add column if not exists whatsapp_buttons_enabled boolean not null default true;
