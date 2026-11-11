-- Limite de uso da IA por empresa (protege a margem: a IA é paga pela plataforma).
-- Somente aditiva, exceto o ajuste do plan_code legado 'starter' -> 'tendi_start'.
--
-- Regra do limite mensal de respostas da IA (mês do calendário, horário de Brasília):
--   1) ai_agents.monthly_reply_limit (exceção definida pelo Super Admin para uma empresa);
--   2) senão subscription_plans.ai_monthly_replies do plano da empresa;
--   3) senão o padrão em platform_settings.ai_limits.default_monthly_replies.
--   Empresas em teste gratuito ficam no menor valor entre esse limite e ai_limits.trial_monthly_replies.

alter table public.subscription_plans
  add column if not exists ai_monthly_replies integer check (ai_monthly_replies is null or ai_monthly_replies > 0);

update public.subscription_plans set ai_monthly_replies = 1000 where code = 'tendi_start' and ai_monthly_replies is null;
update public.subscription_plans set ai_monthly_replies = 3000 where code = 'tendi_pro' and ai_monthly_replies is null;

alter table public.ai_agents
  add column if not exists monthly_reply_limit integer check (monthly_reply_limit is null or monthly_reply_limit > 0);

-- Custo estimado de cada chamada (em dólar, preço de tabela do modelo no momento da resposta).
alter table public.ai_usage_events
  add column if not exists cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0);

insert into public.platform_settings (key, value, description) values
  ('ai_limits', '{"default_monthly_replies": 500, "trial_monthly_replies": 200}'::jsonb,
   'Limites de respostas da IA por mês: padrão (empresa sem plano reconhecido) e teto durante o teste gratuito.'),
  ('ai_pricing', '{"usd_brl": 5.50, "models": {
      "claude-haiku-5-5": {"input": 0.10, "output": 0.50},
      "claude-sonnet-5-5": {"input": 2.00, "output": 10.00},
      "claude-opus-5-5": {"input": 4.00, "output": 20.00}
    }}'::jsonb,
   'Preço de tabela dos modelos (US$ por 1 milhão de tokens) e cotação do dólar, para estimar o custo da IA por empresa.')
on conflict (key) do nothing;

-- Empresas criadas pelo console antigo usavam um código de plano que não existe no catálogo.
update public.organizations set plan_code = 'tendi_start' where plan_code = 'starter';

-- Resumo de uso por empresa para o Super Admin (sem trafegar cada linha para o navegador).
create or replace function public.ai_usage_by_organization(p_since timestamptz)
returns table (organization_id uuid, replies bigint, limit_hits bigint, errors bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric)
language plpgsql
security definer
set search_path = ''
stable
as $fn$
begin
  if not private.is_platform_super_admin() then
    raise exception 'Acesso restrito ao Super Admin.' using errcode = '42501';
  end if;
  return query
    select e.organization_id,
           count(*) filter (where e.outcome in ('replied', 'handoff')),
           count(*) filter (where e.outcome = 'limit'),
           count(*) filter (where e.outcome = 'error'),
           coalesce(sum(e.input_tokens), 0)::bigint,
           coalesce(sum(e.output_tokens), 0)::bigint,
           coalesce(sum(e.cost_usd), 0)
    from public.ai_usage_events e
    where e.created_at >= p_since
    group by e.organization_id;
end;
$fn$;

revoke all on function public.ai_usage_by_organization(timestamptz) from public, anon;
grant execute on function public.ai_usage_by_organization(timestamptz) to authenticated;
