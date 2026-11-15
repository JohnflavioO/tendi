-- IA por canal: em quais canais as conversas novas começam com o agente de IA.
-- Padrão: todos os canais que a IA atende hoje (WhatsApp, Webchat e Instagram).
alter table public.ai_agents
  add column if not exists ai_channels text[] not null default array['whatsapp', 'webchat', 'instagram']::text[];

alter table public.ai_agents
  drop constraint if exists ai_agents_ai_channels_valid;
alter table public.ai_agents
  add constraint ai_agents_ai_channels_valid
  check (ai_channels <@ array['whatsapp', 'webchat', 'instagram']::text[]);

comment on column public.ai_agents.ai_channels is
  'Canais em que conversas novas começam com a IA ligada (whatsapp, webchat, instagram). Messenger fica sempre com a equipe.';
