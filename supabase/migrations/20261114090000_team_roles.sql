-- Equipe: convites e papéis no workspace.
-- 1) Membros passam a ser criados/alterados SÓ pelo servidor (rotas /api/team/*), que aplica as regras:
--    o dono gerencia administradores; administradores gerenciam supervisores e atendentes; ninguém se promove.
--    Antes, a regra "memberships_manage" deixava um admin inserir ou mudar qualquer membro (até virar dono) pela API.
-- 2) Registro de quem convidou e quando.

drop policy if exists memberships_manage on public.organization_memberships;

alter table public.organization_memberships
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz;

create index if not exists organization_memberships_user_idx on public.organization_memberships(user_id);
