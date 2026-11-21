-- Base para carteira comercial privada. Nenhuma empresa é ativada nesta migração.
-- Segurança: a ativação exige revisão posterior de RLS, anexos, APIs e Realtime.
create table if not exists public.sales_portfolio_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 private_mode_enabled boolean not null default false,
 supervisor_visibility boolean not null default true,
 authorized_transfers boolean not null default true,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint private_mode_requires_supervisor_visibility check (not private_mode_enabled or supervisor_visibility)
);
alter table public.sales_portfolio_settings enable row level security;
revoke all on public.sales_portfolio_settings from anon;
grant select on public.sales_portfolio_settings to authenticated;
create policy sales_portfolio_settings_read on public.sales_portfolio_settings for select to authenticated
 using (private.has_org_role(organization_id));

create table if not exists public.sales_portfolio_transfers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,
 from_user_id uuid references auth.users(id) on delete set null,
 to_user_id uuid not null references auth.users(id),
 authorized_by uuid not null references auth.users(id),
 reason text not null check (length(trim(reason)) between 10 and 500),
 created_at timestamptz not null default now()
);
create index if not exists sales_portfolio_transfers_contact_idx on public.sales_portfolio_transfers(organization_id,contact_id,created_at desc);
alter table public.sales_portfolio_transfers enable row level security;
revoke all on public.sales_portfolio_transfers from anon, authenticated;
grant select on public.sales_portfolio_transfers to authenticated;
create policy sales_portfolio_transfers_read on public.sales_portfolio_transfers for select to authenticated
 using (private.has_org_role(organization_id,array['owner','admin','manager']::text[]));

-- Não conceder UPDATE em settings ou INSERT em transfers ao cliente.
-- A alteração de propriedade será feita em rota transacional e auditada na etapa seguinte.
