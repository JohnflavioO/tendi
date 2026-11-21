-- Final security gates for opt-in private portfolio.
-- No organization is enabled by this migration.
-- Ensure every write path has restrictive tenant + ownership checks.
create policy portfolio_contacts_insert on public.contacts as restrictive for insert to authenticated
 with check (
  not exists(select 1 from public.sales_portfolio_settings s
    where s.organization_id=contacts.organization_id and s.private_mode_enabled)
  or (private.is_org_member(organization_id,array['owner','admin']::text[])
      or (private.is_org_member(organization_id,array['agent','manager']::text[])
        and owner_id=auth.uid()))
 );
create policy portfolio_contacts_delete on public.contacts as restrictive for delete to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,id,owner_id));

create policy portfolio_conversations_insert on public.conversations as restrictive for insert to authenticated
 with check (private.sales_portfolio_can_view_conversation(organization_id,contact_id,assigned_to));
create policy portfolio_conversations_delete on public.conversations as restrictive for delete to authenticated
 using (private.sales_portfolio_can_view_conversation(organization_id,contact_id,assigned_to));

create policy portfolio_opportunities_insert on public.opportunities as restrictive for insert to authenticated
 with check (
  private.sales_portfolio_can_view_contact(organization_id,contact_id,
    (select c.owner_id from public.contacts c
     where c.id=contact_id and c.organization_id=opportunities.organization_id))
  and (not exists(select 1 from public.sales_portfolio_settings s
    where s.organization_id=opportunities.organization_id and s.private_mode_enabled)
    or private.is_org_member(organization_id,array['owner','admin']::text[])
    or owner_id=auth.uid())
 );
create policy portfolio_opportunities_delete on public.opportunities as restrictive for delete to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,contact_id,
   (select c.owner_id from public.contacts c
    where c.id=contact_id and c.organization_id=opportunities.organization_id)));

create policy portfolio_activities_insert on public.crm_activities as restrictive for insert to authenticated
 with check (contact_id is null or exists(select 1 from public.contacts c
   where c.id=contact_id and c.organization_id=crm_activities.organization_id
     and private.sales_portfolio_can_view_contact(c.organization_id,c.id,c.owner_id)));

-- Prevent managers from viewing portfolios merely by belonging to a team.
-- Only an explicitly designated team leader is a supervisor.
create or replace function private.portfolio_manager_can_view_owner(p_org uuid,p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_owner is not null and auth.uid() is not null and exists(
  select 1 from public.organization_memberships m
  join public.team_members supervisor on supervisor.organization_id=m.organization_id
    and supervisor.user_id=m.user_id and supervisor.team_role='leader'
  join public.team_members seller on seller.organization_id=supervisor.organization_id
    and seller.team_id=supervisor.team_id and seller.user_id=p_owner
  join public.teams t on t.id=supervisor.team_id and t.organization_id=p_org and t.is_active
  where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and m.role='manager'
 );
$$;

-- Keep portfolio audit visible to authorized owners/admins, not every manager in the organization.
drop policy if exists sales_portfolio_transfers_read on public.sales_portfolio_transfers;
create policy sales_portfolio_transfers_read on public.sales_portfolio_transfers for select to authenticated
 using (private.is_org_member(organization_id,array['owner','admin']::text[])
 or (private.is_org_member(organization_id,array['manager']::text[])
   and private.portfolio_manager_can_view_owner(organization_id,to_user_id)
   and (from_user_id is null or private.portfolio_manager_can_view_owner(organization_id,from_user_id))));
