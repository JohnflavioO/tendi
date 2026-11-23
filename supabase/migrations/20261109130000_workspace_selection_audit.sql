-- Workspace selection persistence and Super Admin access audit.
-- Additive and safe to apply more than once.

alter table public.profiles
  add column if not exists last_workspace_id uuid
  references public.organizations(id) on delete set null;

create index if not exists profiles_last_workspace_id_idx
  on public.profiles(last_workspace_id);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_company_created_idx
  on public.audit_log(company_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_super_admin_insert on public.audit_log;
create policy audit_log_super_admin_insert
  on public.audit_log for insert to authenticated
  with check (private.is_platform_super_admin() and actor_id = (select auth.uid()));

drop policy if exists audit_log_super_admin_select on public.audit_log;
create policy audit_log_super_admin_select
  on public.audit_log for select to authenticated
  using (private.is_platform_super_admin());

grant select, insert on public.audit_log to authenticated;
