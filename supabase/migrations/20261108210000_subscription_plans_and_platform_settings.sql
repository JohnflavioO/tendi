-- Etapa 2: catálogo inicial de planos e configurações da plataforma.
-- Esta migration deve ser aplicada pelo fluxo versionado do projeto; não executar diretamente no Supabase nesta etapa.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  max_attendants integer not null check (max_attendants > 0),
  max_teams integer check (max_teams is null or max_teams > 0),
  ai_enabled boolean not null default false,
  boleto_second_copy_enabled boolean not null default false,
  integrations jsonb not null default '[]'::jsonb,
  monthly_price numeric(12,2),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_integrations_array check (jsonb_typeof(integrations) = 'array'),
  constraint subscription_plans_monthly_price_nonnegative check (monthly_price is null or monthly_price >= 0)
);

alter table public.subscription_plans enable row level security;

drop policy if exists subscription_plans_super_admin_all on public.subscription_plans;
create policy subscription_plans_super_admin_all
on public.subscription_plans
for all to authenticated
using (private.is_platform_super_admin())
with check (private.is_platform_super_admin());

drop policy if exists subscription_plans_active_read on public.subscription_plans;
create policy subscription_plans_active_read
on public.subscription_plans
for select to authenticated
using (is_active = true);

insert into public.subscription_plans
  (code, name, description, max_attendants, max_teams, ai_enabled, boleto_second_copy_enabled, integrations, monthly_price, display_order)
values
  ('tendi_start', 'Tendi Start', 'Atendimento organizado com inteligência artificial para equipes que estão começando.', 4, null, true, false, '[]'::jsonb, null, 1),
  ('tendi_pro', 'Tendi Pro', 'Operação ampliada com equipes e setores, inteligência artificial e recursos de segunda via de boleto.', 10, 10, true, true, '[]'::jsonb, null, 2)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  max_attendants = excluded.max_attendants,
  max_teams = excluded.max_teams,
  ai_enabled = excluded.ai_enabled,
  boleto_second_copy_enabled = excluded.boleto_second_copy_enabled,
  display_order = excluded.display_order,
  updated_at = now();

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_super_admin_all on public.platform_settings;
create policy platform_settings_super_admin_all
on public.platform_settings
for all to authenticated
using (private.is_platform_super_admin())
with check (private.is_platform_super_admin());

insert into public.platform_settings (key, value, description)
values ('trial_days', '14'::jsonb, 'Duração padrão do período de teste gratuito em dias.')
on conflict (key) do nothing;
