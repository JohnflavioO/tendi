-- Opt-in, atomic claim of an unassigned commercial contact.
-- This migration does not enable private mode and does not modify shared inbox routing.
create table if not exists public.sales_portfolio_claims (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,
 claimed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists sales_portfolio_claims_org_contact_idx
 on public.sales_portfolio_claims(organization_id,contact_id,created_at desc);
alter table public.sales_portfolio_claims enable row level security;
revoke all on public.sales_portfolio_claims from anon,authenticated;
grant select on public.sales_portfolio_claims to authenticated;
create policy portfolio_claims_read on public.sales_portfolio_claims for select to authenticated
 using (claimed_by=auth.uid() or private.is_org_member(organization_id,array['owner','admin']::text[])
 or (private.is_org_member(organization_id,array['manager']::text[]) and
   private.portfolio_manager_can_view_owner(organization_id,claimed_by)));

create or replace function public.claim_sales_portfolio(p_organization_id uuid,p_contact_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_owner uuid;
 v_claim_id uuid;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.organization_memberships m
   where m.organization_id=p_organization_id and m.user_id=v_actor
     and m.status='active' and m.role in ('agent','manager','admin','owner'))
 then raise exception 'Active membership required' using errcode='42501'; end if;
 if not exists(select 1 from public.sales_portfolio_settings s
   where s.organization_id=p_organization_id and s.private_mode_enabled)
 then raise exception 'Private portfolio is not enabled' using errcode='22023'; end if;

 -- Contact row lock serializes competing claims. A second caller sees the new owner.
 select c.owner_id into v_owner from public.contacts c
 where c.id=p_contact_id and c.organization_id=p_organization_id for update;
 if not found then raise exception 'Contact not found' using errcode='P0002'; end if;
 if v_owner is not null then raise exception 'Contact already claimed' using errcode='23505'; end if;

 -- Never take over a contact with an already-assigned conversation or opportunity.
 if exists(select 1 from public.conversations c
   where c.organization_id=p_organization_id and c.contact_id=p_contact_id
     and c.assigned_to is not null)
 or exists(select 1 from public.opportunities o
   where o.organization_id=p_organization_id and o.contact_id=p_contact_id
     and o.owner_id is not null)
 then raise exception 'Contact has assigned work; manager transfer required' using errcode='42501'; end if;

 update public.contacts set owner_id=v_actor
   where id=p_contact_id and organization_id=p_organization_id;
 update public.conversations set assigned_to=v_actor
   where organization_id=p_organization_id and contact_id=p_contact_id and assigned_to is null;
 update public.opportunities set owner_id=v_actor
   where organization_id=p_organization_id and contact_id=p_contact_id and owner_id is null;
 insert into public.sales_portfolio_claims(organization_id,contact_id,claimed_by)
 values(p_organization_id,p_contact_id,v_actor) returning id into v_claim_id;
 return v_claim_id;
end $$;
revoke all on function public.claim_sales_portfolio(uuid,uuid) from public,anon;
grant execute on function public.claim_sales_portfolio(uuid,uuid) to authenticated;
