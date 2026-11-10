-- Agentes de IA de atendimento (Etapa A: cadastro).
-- Migração somente aditiva: cria 3 tabelas novas, 1 função auxiliar, 1 coluna em conversations
-- e 1 linha em platform_settings. Nada existente é alterado ou removido.
--
-- Quem pode o quê:
--   ai_agents            -> só o super admin escreve (nome, instruções de treinamento, liga/desliga);
--                           membros da empresa apenas leem.
--   ai_business_profiles -> owner/admin/manager da empresa ajustam as informações do negócio.
--   ai_knowledge_items   -> owner/admin/manager da empresa mantêm a base de conhecimento.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- 1) Agente da empresa (configurado pelo super admin) ------------------------------------------
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null default 'Assistente' check (char_length(name) between 1 and 60),
  is_enabled boolean not null default false,
  niche text not null default '' check (char_length(niche) <= 200),
  tone text not null default 'cordial' check (tone in ('cordial', 'formal', 'descontraido', 'consultivo')),
  system_instructions text not null default '' check (char_length(system_instructions) <= 12000),
  provider text check (provider is null or provider in ('anthropic', 'openai')),
  model text check (model is null or char_length(model) <= 80),
  auto_enable_new_conversations boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_agents enable row level security;

drop policy if exists ai_agents_select on public.ai_agents;
create policy ai_agents_select on public.ai_agents
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists ai_agents_insert on public.ai_agents;
create policy ai_agents_insert on public.ai_agents
  for insert to authenticated with check (private.is_platform_super_admin());
drop policy if exists ai_agents_update on public.ai_agents;
create policy ai_agents_update on public.ai_agents
  for update to authenticated using (private.is_platform_super_admin()) with check (private.is_platform_super_admin());
drop policy if exists ai_agents_delete on public.ai_agents;
create policy ai_agents_delete on public.ai_agents
  for delete to authenticated using (private.is_platform_super_admin());

drop trigger if exists ai_agents_set_updated_at on public.ai_agents;
create trigger ai_agents_set_updated_at before update on public.ai_agents
  for each row execute function private.set_updated_at();

-- 2) Informações do negócio (a empresa ajusta) --------------------------------------------------
create table if not exists public.ai_business_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_description text not null default '' check (char_length(company_description) <= 4000),
  products_services text not null default '' check (char_length(products_services) <= 8000),
  policies text not null default '' check (char_length(policies) <= 4000),
  greeting_message text not null default '' check (char_length(greeting_message) <= 600),
  handoff_message text not null default 'Vou chamar um atendente da nossa equipe para continuar com você. Só um instante!'
    check (char_length(handoff_message) <= 600),
  outside_hours_message text not null default 'Nossa equipe atende em horário comercial. Deixe sua mensagem que retornaremos assim que possível.'
    check (char_length(outside_hours_message) <= 600),
  timezone text not null default 'America/Fortaleza' check (char_length(timezone) between 3 and 60),
  business_hours jsonb not null default '{
    "mon": {"enabled": true,  "start": "08:00", "end": "18:00"},
    "tue": {"enabled": true,  "start": "08:00", "end": "18:00"},
    "wed": {"enabled": true,  "start": "08:00", "end": "18:00"},
    "thu": {"enabled": true,  "start": "08:00", "end": "18:00"},
    "fri": {"enabled": true,  "start": "08:00", "end": "18:00"},
    "sat": {"enabled": false, "start": "08:00", "end": "12:00"},
    "sun": {"enabled": false, "start": "08:00", "end": "12:00"}
  }'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ai_business_profiles enable row level security;

drop policy if exists ai_business_profiles_select on public.ai_business_profiles;
create policy ai_business_profiles_select on public.ai_business_profiles
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists ai_business_profiles_insert on public.ai_business_profiles;
create policy ai_business_profiles_insert on public.ai_business_profiles
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
drop policy if exists ai_business_profiles_update on public.ai_business_profiles;
create policy ai_business_profiles_update on public.ai_business_profiles
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
drop policy if exists ai_business_profiles_delete on public.ai_business_profiles;
create policy ai_business_profiles_delete on public.ai_business_profiles
  for delete to authenticated using (private.is_platform_super_admin());

drop trigger if exists ai_business_profiles_set_updated_at on public.ai_business_profiles;
create trigger ai_business_profiles_set_updated_at before update on public.ai_business_profiles
  for each row execute function private.set_updated_at();

-- 3) Base de conhecimento (perguntas e respostas, preços, regras...) ----------------------------
create table if not exists public.ai_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 6000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_knowledge_items_org_idx on public.ai_knowledge_items(organization_id);
alter table public.ai_knowledge_items enable row level security;

drop policy if exists ai_knowledge_items_select on public.ai_knowledge_items;
create policy ai_knowledge_items_select on public.ai_knowledge_items
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists ai_knowledge_items_insert on public.ai_knowledge_items;
create policy ai_knowledge_items_insert on public.ai_knowledge_items
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
drop policy if exists ai_knowledge_items_update on public.ai_knowledge_items;
create policy ai_knowledge_items_update on public.ai_knowledge_items
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
drop policy if exists ai_knowledge_items_delete on public.ai_knowledge_items;
create policy ai_knowledge_items_delete on public.ai_knowledge_items
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop trigger if exists ai_knowledge_items_set_updated_at on public.ai_knowledge_items;
create trigger ai_knowledge_items_set_updated_at before update on public.ai_knowledge_items
  for each row execute function private.set_updated_at();

-- 4) Liga/desliga da IA por conversa -------------------------------------------------------------
--    off = só atendente | on = o agente responde | handoff = o agente pediu um atendente humano
alter table public.conversations
  add column if not exists ai_mode text not null default 'off' check (ai_mode in ('off', 'on', 'handoff'));

-- 5) Configuração global (provedor e modelo padrão; a chave de API fica só no servidor) ---------
insert into public.platform_settings (key, value, description)
values (
  'ai',
  '{"provider": "anthropic", "models": {"anthropic": "claude-haiku-5-5", "openai": ""}}'::jsonb,
  'Provedor e modelo padrão dos agentes de IA. As chaves de API ficam em variáveis de ambiente do servidor.'
)
on conflict (key) do nothing;
