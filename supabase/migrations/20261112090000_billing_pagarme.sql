-- Assinaturas pagas pela Pagar.me (recorrência no cartão de crédito).
-- 1) Trava: só o Super Admin e o servidor alteram status, plano e teste da empresa
--    (antes, o dono do workspace conseguia mudar essas colunas pela API).
-- 2) Segredos da plataforma no Vault (chave secreta da Pagar.me e segredo do webhook).
-- 3) Plano da Pagar.me ligado a cada plano do Tendi.
-- 4) Assinaturas, links de checkout e eventos de webhook (idempotência e auditoria).

-- 1) Trava das colunas de cobrança -----------------------------------------------------------------
create or replace function private.protect_organization_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (new.status is distinct from old.status
      or new.plan_code is distinct from old.plan_code
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_ends_at is distinct from old.trial_ends_at)
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not private.is_platform_super_admin() then
    raise exception 'Somente a plataforma pode alterar status, plano ou período de teste da empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists organizations_protect_billing on public.organizations;
create trigger organizations_protect_billing before update on public.organizations
  for each row execute function private.protect_organization_billing();

-- 2) Segredos da plataforma no Vault ---------------------------------------------------------------
create or replace function public.set_platform_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_vault_name text;
  v_id uuid;
  v_value text := btrim(coalesce(p_value, ''));
begin
  if p_name not in ('pagarme_secret_key', 'pagarme_webhook_secret') then
    raise exception 'Segredo não permitido: %', p_name;
  end if;
  v_vault_name := 'tendi_' || p_name;
  select id into v_id from vault.secrets where name = v_vault_name;
  if v_value = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(v_value, v_vault_name, 'Segredo da plataforma Tendi (' || p_name || ')');
  else
    perform vault.update_secret(v_id, v_value);
  end if;
end;
$fn$;

create or replace function public.get_platform_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
stable
as $fn$
  select decrypted_secret from vault.decrypted_secrets
  where p_name in ('pagarme_secret_key', 'pagarme_webhook_secret') and name = 'tendi_' || p_name
  limit 1;
$fn$;

revoke all on function public.set_platform_secret(text, text) from public, anon, authenticated;
revoke all on function public.get_platform_secret(text) from public, anon, authenticated;
grant execute on function public.set_platform_secret(text, text) to service_role;
grant execute on function public.get_platform_secret(text) to service_role;

-- 3) Plano correspondente na Pagar.me --------------------------------------------------------------
alter table public.subscription_plans
  add column if not exists pagarme_plan_id text unique,
  add column if not exists pagarme_plan_price numeric(12,2);

-- 4a) Assinatura de cada empresa -------------------------------------------------------------------
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null default 'pagarme' check (provider in ('pagarme')),
  provider_subscription_id text unique,
  provider_customer_id text,
  plan_code text,
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  next_billing_at timestamptz,
  card_brand text,
  card_last_digits text check (card_last_digits is null or card_last_digits ~ '^[0-9]{4}$'),
  canceled_at timestamptz,
  last_event_type text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_subscriptions enable row level security;

drop policy if exists billing_subscriptions_select on public.billing_subscriptions;
create policy billing_subscriptions_select on public.billing_subscriptions
  for select to authenticated
  using (private.is_platform_super_admin() or private.has_org_role(organization_id));

drop trigger if exists billing_subscriptions_set_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_set_updated_at before update on public.billing_subscriptions
  for each row execute function private.set_updated_at();

-- 4b) Links de checkout gerados (reaproveitados por alguns minutos para não criar um por clique) ----
create table if not exists public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null,
  provider_link_id text not null,
  url text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists billing_checkouts_org_created_idx on public.billing_checkouts(organization_id, created_at desc);
alter table public.billing_checkouts enable row level security;

drop policy if exists billing_checkouts_select on public.billing_checkouts;
create policy billing_checkouts_select on public.billing_checkouts
  for select to authenticated
  using (private.is_platform_super_admin() or private.has_org_role(organization_id, array['owner', 'admin']));

-- 4c) Eventos recebidos da Pagar.me ----------------------------------------------------------------
create table if not exists public.billing_events (
  id text primary key,
  provider text not null default 'pagarme',
  type text not null,
  subscription_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text check (error is null or char_length(error) <= 500)
);
create index if not exists billing_events_received_idx on public.billing_events(received_at desc);
alter table public.billing_events enable row level security;

drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events
  for select to authenticated using (private.is_platform_super_admin());
