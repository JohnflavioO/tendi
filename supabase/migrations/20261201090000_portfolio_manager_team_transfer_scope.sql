-- Stage 6: restrict transfers authorized by managers to shared active teams.
-- Replaces the earlier RPC, preserving its signature and audit behavior.
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
  if not exists (select 1 from public.organization_memberships caller
    where caller.organization_id=p_organization_id and caller.user_id=v_actor
      and caller.status='active' and caller.role in ('owner','admin','manager')) then
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
  -- Managers may transfer only between sellers in a team they supervise.
  -- An unassigned contact must be handled by an owner/admin until queue claim is audited.
  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=v_actor
      and m.status='active' and m.role='manager'
  ) then
    if v_old_owner is null or not exists (
      select 1 from public.team_members supervisor
      join public.team_members source on source.team_id=supervisor.team_id
        and source.organization_id=supervisor.organization_id
        and source.user_id=v_old_owner
      join public.team_members destination on destination.team_id=supervisor.team_id
        and destination.organization_id=supervisor.organization_id
        and destination.user_id=p_to_user_id
      join public.teams t on t.id=supervisor.team_id
        and t.organization_id=p_organization_id and t.is_active
      where supervisor.organization_id=p_organization_id
        and supervisor.user_id=v_actor
    ) then
      raise exception 'Transfer outside supervised teams' using errcode='42501';
    end if;
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
