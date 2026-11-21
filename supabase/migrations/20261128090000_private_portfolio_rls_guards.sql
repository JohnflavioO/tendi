-- Stage 2: opt-in RLS guardrails. Existing organizations remain in shared mode.
-- IMPORTANT: Do not enable private_mode_enabled until Storage, service-role routes,
-- Realtime and ownership-transfer workflow have passed end-to-end review.
create or replace function private.sales_portfolio_can_view_contact(
 p_org uuid, p_contact uuid, p_owner uuid
) returns boolean language plpgsql stable security definer
set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then return false; end if;
 if not private.has_org_role(p_org) then return false; end if;
 if not exists(select 1 from public.sales_portfolio_settings s
   where s.organization_id=p_org and s.private_mode_enabled) then return true; end if;
 if private.has_org_role(p_org,array['owner','admin','manager']::text[]) then return true; end if;
 if p_owner is not null then return p_owner=v_uid; end if;
 -- Unowned contact is only public if no other seller has already claimed a conversation.
 return not exists(select 1 from public.conversations c
   where c.organization_id=p_org and c.contact_id=p_contact
     and c.assigned_to is not null and c.assigned_to<>v_uid);
end $$;
create or replace function private.sales_portfolio_can_view_conversation(
 p_org uuid,p_contact uuid,p_assignee uuid
) returns boolean language plpgsql stable security definer
set search_path = '' as $$
declare v_owner uuid;
begin
 if not private.has_org_role(p_org) then return false; end if;
 if not exists(select 1 from public.sales_portfolio_settings s
   where s.organization_id=p_org and s.private_mode_enabled) then return true; end if;
 if private.has_org_role(p_org,array['owner','admin','manager']::text[]) then return true; end if;
 select owner_id into v_owner from public.contacts
 where id=p_contact and organization_id=p_org;
 if not found then return false; end if;
 if v_owner is not null then return v_owner=auth.uid(); end if;
 return p_assignee is null or p_assignee=auth.uid();
end $$;
revoke all on function private.sales_portfolio_can_view_contact(uuid,uuid,uuid) from public,anon;
revoke all on function private.sales_portfolio_can_view_conversation(uuid,uuid,uuid) from public,anon;
grant execute on function private.sales_portfolio_can_view_contact(uuid,uuid,uuid) to authenticated;
grant execute on function private.sales_portfolio_can_view_conversation(uuid,uuid,uuid) to authenticated;

-- RESTRICTIVE policies are AND-ed with existing tenant policies, not OR-ed.
create policy portfolio_contacts_select on public.contacts as restrictive for select to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,id,owner_id));
create policy portfolio_contacts_update on public.contacts as restrictive for update to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,id,owner_id))
 with check (private.sales_portfolio_can_view_contact(organization_id,id,owner_id));
create policy portfolio_conversations_select on public.conversations as restrictive for select to authenticated
 using (private.sales_portfolio_can_view_conversation(organization_id,contact_id,assigned_to));
create policy portfolio_conversations_update on public.conversations as restrictive for update to authenticated
 using (private.sales_portfolio_can_view_conversation(organization_id,contact_id,assigned_to))
 with check (private.sales_portfolio_can_view_conversation(organization_id,contact_id,assigned_to));
create policy portfolio_messages_select on public.messages as restrictive for select to authenticated
 using (exists(select 1 from public.conversations c where c.id=conversation_id
   and c.organization_id=messages.organization_id
   and private.sales_portfolio_can_view_conversation(c.organization_id,c.contact_id,c.assigned_to)));
create policy portfolio_messages_insert on public.messages as restrictive for insert to authenticated
 with check (exists(select 1 from public.conversations c where c.id=conversation_id
   and c.organization_id=messages.organization_id
   and private.sales_portfolio_can_view_conversation(c.organization_id,c.contact_id,c.assigned_to)));
create policy portfolio_opportunities_select on public.opportunities as restrictive for select to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,contact_id,
   (select c.owner_id from public.contacts c where c.id=contact_id and c.organization_id=opportunities.organization_id)));
create policy portfolio_opportunities_update on public.opportunities as restrictive for update to authenticated
 using (private.sales_portfolio_can_view_contact(organization_id,contact_id,
   (select c.owner_id from public.contacts c where c.id=contact_id and c.organization_id=opportunities.organization_id)))
 with check (private.sales_portfolio_can_view_contact(organization_id,contact_id,
   (select c.owner_id from public.contacts c where c.id=contact_id and c.organization_id=opportunities.organization_id)));
create policy portfolio_activities_select on public.crm_activities as restrictive for select to authenticated
 using (contact_id is null or exists(select 1 from public.contacts c where c.id=contact_id
   and c.organization_id=crm_activities.organization_id
   and private.sales_portfolio_can_view_contact(c.organization_id,c.id,c.owner_id)));

-- Fail closed for manual activation: until all surfaces are audited,
-- do not grant authenticated role permission to modify the feature flag.
revoke insert,update,delete on public.sales_portfolio_settings from authenticated;
