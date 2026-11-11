-- Ajustes de índices apontados pelo verificador do Supabase.
-- 1) organization_memberships_user_idx (criado em 20261114090000_team_roles) duplicava
--    organization_memberships_user_id_idx: fica só o original.
-- 2) Chaves estrangeiras sem índice: billing_events.organization_id e organization_memberships.invited_by.

drop index if exists public.organization_memberships_user_idx;

create index if not exists billing_events_organization_id_idx on public.billing_events(organization_id);
create index if not exists organization_memberships_invited_by_idx on public.organization_memberships(invited_by);
