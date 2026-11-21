-- Cobrança avulsa de implantação vinculada a um único workspace e proposta.
alter table public.business_onboardings
 add column if not exists setup_payment_link_id text,
 add column if not exists setup_payment_url text,
 add column if not exists setup_payment_order_code text,
 add column if not exists setup_payment_order_id text,
 add column if not exists setup_payment_status text not null default 'not_created'
   check (setup_payment_status in ('not_created','pending','paid','refunded','waived')),
 add column if not exists setup_paid_at timestamptz,
 add column if not exists setup_verified_at timestamptz,
 add column if not exists setup_waived_by uuid,
 add column if not exists setup_waived_reason text;
create unique index if not exists business_setup_order_code_unique on public.business_onboardings(setup_payment_order_code) where setup_payment_order_code is not null;
create unique index if not exists business_setup_order_id_unique on public.business_onboardings(setup_payment_order_id) where setup_payment_order_id is not null;
