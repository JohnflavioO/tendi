-- Stage 4: prevent client-side reassignment and isolate private Inbox media.
-- All checks are inert while private_mode_enabled is false.
create or replace function private.portfolio_guard_ownership()
returns trigger language plpgsql set search_path = '' as $$
declare v_private boolean;
begin
  if current_user <> 'authenticated' then return new; end if;
  select coalesce(s.private_mode_enabled,false) into v_private
    from public.sales_portfolio_settings s where s.organization_id=new.organization_id;
  if not coalesce(v_private,false) then return new; end if;
  if private.has_org_role(new.organization_id,array['owner','admin','manager']::text[]) then
    -- Managers must use the audited RPC for ownership transfers.
    if tg_op='UPDATE' and (
      (tg_table_name='contacts' and old.owner_id is distinct from new.owner_id) or
      (tg_table_name='conversations' and old.assigned_to is distinct from new.assigned_to) or
      (tg_table_name='opportunities' and old.owner_id is distinct from new.owner_id)
    ) then raise exception 'Use authorized portfolio transfer' using errcode='42501'; end if;
    return new;
  end if;
  if not private.has_org_role(new.organization_id,array['agent']::text[]) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if tg_table_name='contacts' then
    if tg_op='INSERT' then
      if new.owner_id is distinct from auth.uid() then
        raise exception 'New contact must belong to the current seller' using errcode='42501'; end if;
    elsif old.owner_id is distinct from new.owner_id then
      raise exception 'Cannot reassign contact' using errcode='42501'; end if;
  elsif tg_table_name='conversations' then
    if tg_op='INSERT' then
      if new.assigned_to is distinct from auth.uid() then
        raise exception 'New conversation must belong to the current seller' using errcode='42501'; end if;
    elsif old.assigned_to is distinct from new.assigned_to then
      raise exception 'Cannot reassign conversation' using errcode='42501'; end if;
  elsif tg_table_name='opportunities' then
    if tg_op='INSERT' then
      if new.owner_id is distinct from auth.uid() then
        raise exception 'New opportunity must belong to the current seller' using errcode='42501'; end if;
    elsif old.owner_id is distinct from new.owner_id then
      raise exception 'Cannot reassign opportunity' using errcode='42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists portfolio_contacts_owner_guard on public.contacts;
create trigger portfolio_contacts_owner_guard before insert or update on public.contacts
 for each row execute function private.portfolio_guard_ownership();
drop trigger if exists portfolio_conversations_assignee_guard on public.conversations;
create trigger portfolio_conversations_assignee_guard before insert or update on public.conversations
 for each row execute function private.portfolio_guard_ownership();
drop trigger if exists portfolio_opportunities_owner_guard on public.opportunities;
create trigger portfolio_opportunities_owner_guard before insert or update on public.opportunities
 for each row execute function private.portfolio_guard_ownership();

-- Storage objects use <organization UUID>/<conversation UUID>/<filename>.
-- Restrictive policy is AND-ed with existing bucket policies.
create or replace function private.portfolio_can_access_media(p_name text)
returns boolean language plpgsql stable security definer
set search_path = '' as $$
declare v_org uuid; v_conversation uuid;
begin
 if auth.uid() is null then return false; end if;
 if split_part(p_name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or split_part(p_name,'/',2) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then return false; end if;
 v_org := split_part(p_name,'/',1)::uuid;
 v_conversation := split_part(p_name,'/',2)::uuid;
 if not private.has_org_role(v_org) then return false; end if;
 if not exists(select 1 from public.sales_portfolio_settings s
   where s.organization_id=v_org and s.private_mode_enabled) then return true; end if;
 return exists(select 1 from public.conversations c
  where c.id=v_conversation and c.organization_id=v_org
    and private.sales_portfolio_can_view_conversation(c.organization_id,c.contact_id,c.assigned_to));
end $$;
revoke all on function private.portfolio_can_access_media(text) from public,anon;
grant execute on function private.portfolio_can_access_media(text) to authenticated;
create policy portfolio_media_select on storage.objects as restrictive for select to authenticated
 using (bucket_id <> 'inbox-media' or private.portfolio_can_access_media(name));
create policy portfolio_media_insert on storage.objects as restrictive for insert to authenticated
 with check (bucket_id <> 'inbox-media' or private.portfolio_can_access_media(name));
