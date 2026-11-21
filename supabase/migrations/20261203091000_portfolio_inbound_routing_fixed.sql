-- Stage 8: preserve private Inbox routing for service-role inbound webhooks.
-- In shared mode this trigger is inert. No private-mode flags are enabled here.
-- On insertion of a new conversation by QR/Meta/webchat service integration:
-- existing private contact -> same seller; unowned contact -> shared unassigned queue.
create or replace function private.portfolio_route_inbound_conversation()
returns trigger language plpgsql security invoker set search_path='' as $portfolio$
declare v_owner uuid; v_private boolean;
begin
  -- Do not interfere with user-created conversations or audited portfolio transfers.
  if current_user <> 'service_role' then return new; end if;
  select s.private_mode_enabled into v_private from public.sales_portfolio_settings s
    where s.organization_id=new.organization_id;
  if not coalesce(v_private,false) then return new; end if;

  -- Contact lookup is tenant-scoped: a cross-tenant contact must never be routed.
  select c.owner_id into v_owner from public.contacts c
    where c.id=new.contact_id and c.organization_id=new.organization_id;
  if not found then
    raise exception 'Conversation contact does not belong to organization' using errcode='23503';
  end if;
  -- Never trust an incoming webhook-provided assignee for a private customer.
  new.assigned_to := v_owner;
  return new;
end $portfolio$;
drop trigger if exists portfolio_route_inbound_conversation on public.conversations;
create trigger portfolio_route_inbound_conversation
before insert on public.conversations
for each row execute function private.portfolio_route_inbound_conversation();

-- Prevent media lookup from accepting a path for another conversation of the same org.
-- Existing message RLS continues to be the authorization source for this server route.
