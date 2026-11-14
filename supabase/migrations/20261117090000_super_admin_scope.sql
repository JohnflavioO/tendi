-- Confidencialidade: o Super Admin da plataforma deixa de enxergar os dados de atendimento das empresas.
--
-- Antes: private.has_org_role() devolvia true para o Super Admin em QUALQUER empresa, então ele lia
-- conversas, mensagens, contatos, CRM e os arquivos do Inbox de todos os clientes.
-- Agora: has_org_role() vale só para quem tem vínculo ativo com a empresa. O Super Admin ganha acesso
-- explícito apenas ao que o Console precisa: cadastro e plano da empresa, usuários, conexão do
-- WhatsApp, configuração do agente de IA e a estrutura inicial (equipe e funil) criada no cadastro.
--
-- Sem acesso para o Super Admin depois desta migration: conversations, messages, contacts,
-- opportunities, crm_activities, team_members e os arquivos do bucket inbox-media.

-- 1) Papel na empresa = vínculo ativo. Nada de atalho para o Super Admin.
create or replace function private.has_org_role(
  target_org uuid,
  allowed_roles text[] default array['owner', 'admin', 'manager', 'agent']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships om
    where om.organization_id = target_org
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$$;

-- 2) Acessos explícitos do Console Super Admin (configuração da conta, nunca o conteúdo do atendimento).

-- Empresa: alterar cadastro, plano, status e período de teste.
drop policy if exists organizations_update_superadmin on public.organizations;
create policy organizations_update_superadmin on public.organizations
  for update to authenticated
  using (private.is_platform_super_admin())
  with check (private.is_platform_super_admin());

-- Usuários da empresa: o Console mostra quantas pessoas cada empresa tem.
drop policy if exists memberships_select_superadmin on public.organization_memberships;
create policy memberships_select_superadmin on public.organization_memberships
  for select to authenticated
  using (private.is_platform_super_admin());

-- Estrutura inicial criada junto com a empresa: equipe "Atendimento" e funil "Vendas".
drop policy if exists teams_select_superadmin on public.teams;
create policy teams_select_superadmin on public.teams
  for select to authenticated
  using (private.is_platform_super_admin());

drop policy if exists teams_insert_superadmin on public.teams;
create policy teams_insert_superadmin on public.teams
  for insert to authenticated
  with check (private.is_platform_super_admin());

drop policy if exists pipelines_select_superadmin on public.crm_pipelines;
create policy pipelines_select_superadmin on public.crm_pipelines
  for select to authenticated
  using (private.is_platform_super_admin());

drop policy if exists pipelines_insert_superadmin on public.crm_pipelines;
create policy pipelines_insert_superadmin on public.crm_pipelines
  for insert to authenticated
  with check (private.is_platform_super_admin());

drop policy if exists stages_insert_superadmin on public.crm_stages;
create policy stages_insert_superadmin on public.crm_stages
  for insert to authenticated
  with check (private.is_platform_super_admin());

-- Conexão do WhatsApp (sessão, status e assinatura das mensagens). Não contém mensagens.
drop policy if exists channels_superadmin on public.channel_connections;
create policy channels_superadmin on public.channel_connections
  for all to authenticated
  using (private.is_platform_super_admin())
  with check (private.is_platform_super_admin());

-- Agente de IA: o Console libera o agente e edita o perfil do negócio e a base de conhecimento.
drop policy if exists ai_agents_select_superadmin on public.ai_agents;
create policy ai_agents_select_superadmin on public.ai_agents
  for select to authenticated
  using (private.is_platform_super_admin());

drop policy if exists ai_business_profiles_superadmin on public.ai_business_profiles;
create policy ai_business_profiles_superadmin on public.ai_business_profiles
  for all to authenticated
  using (private.is_platform_super_admin())
  with check (private.is_platform_super_admin());

drop policy if exists ai_knowledge_items_superadmin on public.ai_knowledge_items;
create policy ai_knowledge_items_superadmin on public.ai_knowledge_items
  for all to authenticated
  using (private.is_platform_super_admin())
  with check (private.is_platform_super_admin());

-- 3) Totais da plataforma para o painel do Console: só números, sem nenhuma linha de conversa ou contato.
create or replace function public.platform_usage_totals()
returns table(conversations bigint, contacts bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_super_admin() then
    raise exception 'Acesso restrito ao Super Admin.' using errcode = '42501';
  end if;
  return query
    select (select count(*) from public.conversations),
           (select count(*) from public.contacts);
end;
$$;

revoke all on function public.platform_usage_totals() from public;
revoke all on function public.platform_usage_totals() from anon;
grant execute on function public.platform_usage_totals() to authenticated;
