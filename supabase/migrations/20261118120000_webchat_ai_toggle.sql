-- Webchat: a empresa escolhe se o Agente de IA atende as conversas do site ou se só a equipe responde.
-- Padrão: IA ligada (mantém o comportamento atual). Vale para conversas novas do widget.
alter table public.webchat_widgets
  add column if not exists ai_enabled boolean not null default true;

comment on column public.webchat_widgets.ai_enabled is
  'true = conversas novas do site começam com o Agente de IA (se o agente da empresa estiver liberado); false = só atendimento humano.';
