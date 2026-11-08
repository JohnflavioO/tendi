-- Etapa 3: cadastro público e provisionamento seguro do workspace em período de teste.
-- O cliente nunca recebe permissões diretas para criar organizações ou memberships.
-- A função SECURITY DEFINER valida auth.uid() e executa toda a criação em uma transação.

alter table public.organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

alter table public.subscription_plans enable row level security;
grant select on public.subscription_plans to anon;
drop policy if exists subscription_plans_public_active_read on public.subscription_plans;
create policy subscription_plans_public_active_read
on public.subscription_plans
for select to anon
using (is_active = true);

create or replace function public.provision_customer_workspace(
  p_organization_name text,
  p_plan_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_plan public.subscription_plans%rowtype;
  v_trial_days integer;
  v_slug text;
  v_org_id uuid;
  v_pipeline_id uuid;
begin
  if v_user_id is null then
    raise exception 'É necessário estar autenticado para concluir o cadastro.';
  end if;

  if length(trim(coalesce(p_organization_name, ''))) < 2
     or length(trim(p_organization_name)) > 100 then
    raise exception 'Informe um nome de empresa entre 2 e 100 caracteres.';
  end if;

  if p_plan_code not in ('tendi_start', 'tendi_pro') then
    raise exception 'Plano selecionado inválido.';
  end if;

  if exists (
    select 1 from public.organization_memberships
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'Este usuário já possui um workspace vinculado.';
  end if;

  select * into v_plan
  from public.subscription_plans
  where code = p_plan_code and is_active = true;

  if not found then
    raise exception 'O plano selecionado não está disponível.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if v_email is null then
    raise exception 'Não foi possível validar o e-mail da conta.';
  end if;

  select coalesce((value #>> '{}')::integer, 14)
    into v_trial_days
  from public.platform_settings
  where key = 'trial_days';
  v_trial_days := greatest(coalesce(v_trial_days, 14), 1);

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_organization_name)), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(coalesce(nullif(v_slug, ''), 'empresa'), 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.organizations (
    name, slug, status, plan_code, trial_started_at, trial_ends_at
  ) values (
    trim(p_organization_name), v_slug, 'trial', v_plan.code,
    now(), now() + make_interval(days => v_trial_days)
  ) returning id into v_org_id;

  insert into public.profiles (id, email, full_name)
  values (
    v_user_id,
    lower(v_email),
    coalesce(nullif(trim((select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)), ''), '')
  )
  on conflict (id) do nothing;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (v_org_id, v_user_id, 'owner', 'active');

  insert into public.teams (organization_id, name, description, color)
  values (v_org_id, 'Atendimento', 'Equipe principal de atendimento', '#004751');

  insert into public.crm_pipelines (organization_id, name, is_default)
  values (v_org_id, 'Vendas', true)
  returning id into v_pipeline_id;

  insert into public.crm_stages (organization_id, pipeline_id, name, position, color, final_type)
  values
    (v_org_id, v_pipeline_id, 'Novo lead', 0, '#2F316B', 'open'),
    (v_org_id, v_pipeline_id, 'Contato feito', 1, '#004751', 'open'),
    (v_org_id, v_pipeline_id, 'Proposta enviada', 2, '#CB0A9F', 'open'),
    (v_org_id, v_pipeline_id, 'Em negociação', 3, '#2F316B', 'open'),
    (v_org_id, v_pipeline_id, 'Fechado', 4, '#004751', 'won'),
    (v_org_id, v_pipeline_id, 'Perdido', 5, '#64748b', 'lost');

  return v_org_id;
end;
$$;

revoke all on function public.provision_customer_workspace(text, text) from public;
revoke all on function public.provision_customer_workspace(text, text) from anon;
grant execute on function public.provision_customer_workspace(text, text) to authenticated;
