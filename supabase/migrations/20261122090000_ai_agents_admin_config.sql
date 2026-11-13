-- Deixa o dono/administrador do workspace configurar o próprio agente de IA (nome, nicho, tom,
-- instruções de treinamento, liga/desliga, ligar automático em conversas novas). O Super Admin
-- continua exclusivo para o que afeta o custo/infra compartilhada: provedor, modelo e o limite
-- mensal de respostas — mudanças nessas três colunas por quem não é Super Admin são silenciosamente
-- ignoradas (voltam ao valor anterior), tanto no update quanto no insert.
-- Migração somente aditiva: não remove nem recria tabelas, só troca as policies de ai_agents e
-- adiciona um trigger de proteção de colunas.

create or replace function private.ai_agents_guard_admin_only_columns()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if not private.is_platform_super_admin() then
    if tg_op = 'INSERT' then
      new.provider := null;
      new.model := null;
      new.monthly_reply_limit := null;
    else
      new.provider := old.provider;
      new.model := old.model;
      new.monthly_reply_limit := old.monthly_reply_limit;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists ai_agents_guard_admin_only_columns on public.ai_agents;
create trigger ai_agents_guard_admin_only_columns before insert or update on public.ai_agents
  for each row execute function private.ai_agents_guard_admin_only_columns();

drop policy if exists ai_agents_insert on public.ai_agents;
create policy ai_agents_insert on public.ai_agents
  for insert to authenticated
  with check (private.is_platform_super_admin() or private.has_org_role(organization_id, array['owner', 'admin']));

drop policy if exists ai_agents_update on public.ai_agents;
create policy ai_agents_update on public.ai_agents
  for update to authenticated
  using (private.is_platform_super_admin() or private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.is_platform_super_admin() or private.has_org_role(organization_id, array['owner', 'admin']));
