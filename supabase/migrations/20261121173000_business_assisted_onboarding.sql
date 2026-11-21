-- Contratação assistida Business: independente do checkout Start/Pro.
-- Nenhuma assinatura, plano ou cobrança existente é alterada.
create table if not exists public.business_onboardings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 status text not null default 'requested' check (status in (
  'requested','proposal_approved','awaiting_payment','paid_awaiting_setup','awaiting_meta_validation','active'
 )),
 proposed_monthly_cents integer check (proposed_monthly_cents is null or proposed_monthly_cents > 0),
 setup_fee_cents integer check (setup_fee_cents is null or setup_fee_cents >= 0),
 number_source text check (number_source in ('customer','tendidesk')),
 proposal_notes text,
 payment_verified_at timestamptz,
 payment_verified_by uuid,
 updated_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.business_onboarding_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 from_status text,
 to_status text not null,
 actor_user_id uuid,
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists business_onboarding_events_org_idx on public.business_onboarding_events(organization_id,created_at desc);
alter table public.business_onboardings enable row level security;
alter table public.business_onboarding_events enable row level security;
revoke all on public.business_onboardings, public.business_onboarding_events from anon, authenticated;
grant select, insert, update, delete on public.business_onboardings, public.business_onboarding_events to service_role;
