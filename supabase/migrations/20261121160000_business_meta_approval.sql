-- Business é um plano de contratação assistida, sem checkout automático.
-- Não modifica Start/Pro nem assinaturas existentes.
insert into public.subscription_plans
 (code,name,description,max_attendants,max_teams,ai_enabled,boleto_second_copy_enabled,integrations,monthly_price,is_active,display_order)
values ('tendi_business','TendiDesk Business','WhatsApp oficial da Meta com contratação e ativação assistidas.',10,10,true,true,'[]'::jsonb,null,true,3)
on conflict (code) do nothing;

-- A aprovação operacional é independente da assinatura. Só a chave de serviço e o
-- Super Admin podem alterá-la; clientes não têm acesso de escrita.
create table if not exists public.whatsapp_official_approvals (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 approved boolean not null default false,
 billing_verified boolean not null default false,
 approved_by uuid,
 approved_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.whatsapp_official_approvals enable row level security;
revoke all on public.whatsapp_official_approvals from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_official_approvals to service_role;
