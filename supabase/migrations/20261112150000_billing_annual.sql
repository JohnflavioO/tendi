-- Assinatura anual (com desconto) além da mensal. Migração somente aditiva.
-- Cada plano do Tendi pode ter dois planos na Pagar.me: o mensal (pagarme_plan_id) e o anual.

alter table public.subscription_plans
  add column if not exists pagarme_annual_plan_id text unique,
  add column if not exists annual_price numeric(12,2) check (annual_price is null or annual_price > 0);

alter table public.billing_subscriptions
  add column if not exists billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual'));

alter table public.billing_checkouts
  add column if not exists billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual'));
