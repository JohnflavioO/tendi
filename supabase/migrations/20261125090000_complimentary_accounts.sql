-- Conta cortesia (parceiros) e histórico de mudanças de plano feitas pelo Console Super Admin.
-- 1) Colunas da cortesia na empresa: desde quando, até quando (vazio = sem prazo), motivo e quem liberou.
-- 2) A trava de cobrança passa a proteger também essas colunas (o dono do workspace não se dá cortesia).
-- 3) Histórico: cada troca de plano e cada cortesia liberada, alterada ou revogada, com autor e data.
--    Só o servidor (chave de serviço) grava; só o Super Admin lê.

-- 1) Colunas da cortesia ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists complimentary_since timestamptz,
  add column if not exists complimentary_until timestamptz,
  add column if not exists complimentary_reason text,
  add column if not exists complimentary_by uuid references auth.users(id) on delete set null;

alter table public.organizations drop constraint if exists organizations_complimentary_reason_check;
alter table public.organizations
  add constraint organizations_complimentary_reason_check
  check (complimentary_reason is null or char_length(complimentary_reason) <= 300);

-- 2) Trava das colunas de cobrança (inclui as da cortesia) -----------------------------------------
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
      or new.trial_ends_at is distinct from old.trial_ends_at
      or new.complimentary_since is distinct from old.complimentary_since
      or new.complimentary_until is distinct from old.complimentary_until
      or new.complimentary_reason is distinct from old.complimentary_reason
      or new.complimentary_by is distinct from old.complimentary_by)
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not private.is_platform_super_admin() then
    raise exception 'Somente a plataforma pode alterar status, plano, teste ou cortesia da empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- 3) Histórico de plano e cortesia -----------------------------------------------------------------
create table if not exists public.organization_plan_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('plan_changed', 'complimentary_granted', 'complimentary_updated', 'complimentary_revoked')),
  from_plan_code text,
  to_plan_code text,
  complimentary_until timestamptz,
  reason text check (reason is null or char_length(reason) <= 300),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists organization_plan_changes_org_created_idx
  on public.organization_plan_changes(organization_id, created_at desc);
alter table public.organization_plan_changes enable row level security;

drop policy if exists organization_plan_changes_select on public.organization_plan_changes;
create policy organization_plan_changes_select on public.organization_plan_changes
  for select to authenticated using (private.is_platform_super_admin());
