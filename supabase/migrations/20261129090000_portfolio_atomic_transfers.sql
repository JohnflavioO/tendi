-- Atomic, auditable transfer. The private-mode flag remains disabled.
-- This RPC uses the authenticated caller's auth.uid(), never a client-supplied actor.
create or replace function public.transfer_sales_portfolio(
  p_organization_id uuid,
  p_contact_id uuid,
  p_to_user_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old_owner uuid;
  v_transfer_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not private.has_org_role(p_organization_id, array['owner','admin','manager']::text[]) then
    raise exception 'Only managers may authorize transfers' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 10 and 500 then
    raise exception 'Transfer reason must contain 10 to 500 characters' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_to_user_id and m.status='active'
      and m.role in ('agent','manager','admin','owner')
  ) then raise exception 'Recipient must be an active organization member' using errcode='22023'; end if;
  if not exists (
    select 1 from public.sales_portfolio_settings s
    where s.organization_id=p_organization_id and s.authorized_transfers=true
  ) then raise exception 'Portfolio transfers not configured' using errcode='22023'; end if;
  select owner_id into v_old_owner
  from public.contacts where id=p_contact_id and organization_id=p_organization_id
  for update;
  if not found then raise exception 'Contact not found' using errcode='P0002'; end if;
  if v_old_owner is not distinct from p_to_user_id then
    raise exception 'Contact already belongs to this member' using errcode='22023';
  end if;
  update public.contacts set owner_id=p_to_user_id
    where id=p_contact_id and organization_id=p_organization_id;
  update public.conversations set assigned_to=p_to_user_id
    where contact_id=p_contact_id and organization_id=p_organization_id;
  update public.opportunities set owner_id=p_to_user_id
    where contact_id=p_contact_id and organization_id=p_organization_id;
  insert into public.sales_portfolio_transfers
    (organization_id,contact_id,from_user_id,to_user_id,authorized_by,reason)
    values (p_organization_id,p_contact_id,v_old_owner,p_to_user_id,v_actor,trim(p_reason))
    returning id into v_transfer_id;
  return v_transfer_id;
end $$;
revoke all on function public.transfer_sales_portfolio(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_sales_portfolio(uuid,uuid,uuid,text) to authenticated;
