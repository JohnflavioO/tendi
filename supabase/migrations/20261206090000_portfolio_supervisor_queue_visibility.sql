-- Supervisores (gestores que lideram ao menos uma equipe ativa) passam a ver, no modo privado
-- de carteiras, os leads/contatos AINDA SEM DONO (fila de novos) — hoje só dono/admin viam.
-- Continua sem liberar nada sobre contatos JÁ atribuídos a vendedores fora da equipe que
-- o gestor supervisiona; essa parte (portfolio_manager_can_view_owner) não muda.
-- Migração somente aditiva: só troca o corpo de duas funções (create or replace).

create or replace function private.portfolio_manager_is_supervisor(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.organization_memberships m
    join public.team_members tm on tm.organization_id=m.organization_id and tm.user_id=m.user_id and tm.team_role='leader'
    join public.teams t on t.id=tm.team_id and t.organization_id=p_org and t.is_active
    where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and m.role='manager'
  );
$$;
revoke all on function private.portfolio_manager_is_supervisor(uuid) from public,anon;
grant execute on function private.portfolio_manager_is_supervisor(uuid) to authenticated;

create or replace function private.sales_portfolio_can_view_contact(p_org uuid,p_contact uuid,p_owner uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null or not private.has_org_role(p_org) then return false; end if;
 if not exists(select 1 from public.sales_portfolio_settings s where s.organization_id=p_org and s.private_mode_enabled) then return true; end if;
 if private.is_org_member(p_org,array['owner','admin']::text[]) then return true; end if;
 if private.is_org_member(p_org,array['manager']::text[]) then
   if p_owner is not null then return private.portfolio_manager_can_view_owner(p_org,p_owner); end if;
   -- Lead ainda sem dono: visível ao supervisor para triagem/atribuição da fila.
   return private.portfolio_manager_is_supervisor(p_org);
 end if;
 if p_owner is not null then return p_owner=v_uid; end if;
 return p_contact is not null and not exists(select 1 from public.conversations c
   where c.organization_id=p_org and c.contact_id=p_contact
     and c.assigned_to is not null and c.assigned_to<>v_uid);
end $$;

create or replace function private.sales_portfolio_can_view_conversation(p_org uuid,p_contact uuid,p_assignee uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid;
begin
 if auth.uid() is null or not private.has_org_role(p_org) then return false; end if;
 if not exists(select 1 from public.sales_portfolio_settings s where s.organization_id=p_org and s.private_mode_enabled) then return true; end if;
 if private.is_org_member(p_org,array['owner','admin']::text[]) then return true; end if;
 select owner_id into v_owner from public.contacts where id=p_contact and organization_id=p_org;
 if not found then return false; end if;
 if private.is_org_member(p_org,array['manager']::text[]) then
   if v_owner is not null then return private.portfolio_manager_can_view_owner(p_org,v_owner); end if;
   -- Conversa de um lead ainda sem dono: visível ao supervisor para triagem/atribuição da fila.
   return private.portfolio_manager_is_supervisor(p_org);
 end if;
 if v_owner is not null then return v_owner=auth.uid(); end if;
 return (p_assignee is null or p_assignee=auth.uid())
   and not exists(select 1 from public.conversations c
     where c.organization_id=p_org and c.contact_id=p_contact
       and c.assigned_to is not null and c.assigned_to<>auth.uid());
end $$;
