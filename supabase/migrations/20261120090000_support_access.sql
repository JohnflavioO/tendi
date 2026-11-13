-- Acesso de suporte com autorização do cliente + workspace interno da plataforma.
--
-- Regra geral (migration super_admin_scope): o Super Admin NÃO enxerga conversas, contatos, CRM,
-- agenda nem arquivos das empresas. Esta migration cria a única exceção, sempre iniciada pelo cliente:
--
--   1. O dono ou administrador da empresa gera um código de suporte (8 dígitos, vale 15 minutos)
--      e escolhe por quanto tempo o acesso fica aberto (1 a 24 horas).
--   2. Ele passa o código ao suporte da Tendi.
--   3. O Super Admin informa o código no Console e ganha acesso total àquela empresa até o prazo
--      acabar, ou até alguém encerrar (o cliente ou o próprio suporte).
--
-- O código nunca fica guardado: só o seu resumo (SHA-256). Todo acesso fica registrado nesta tabela.

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash text not null,
  access_hours integer not null check (access_hours between 1 and 24),
  reason text check (reason is null or char_length(reason) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Até quando o código pode ser usado.
  code_expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  -- Até quando o acesso do suporte vale (preenchido quando o código é usado).
  access_expires_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null
);
create index if not exists support_access_grants_org_idx on public.support_access_grants(organization_id, created_at desc);
create index if not exists support_access_grants_code_idx on public.support_access_grants(code_hash) where redeemed_at is null and ended_at is null;
create index if not exists support_access_grants_active_idx on public.support_access_grants(redeemed_by, organization_id) where ended_at is null and redeemed_at is not null;
create index if not exists support_access_grants_created_by_idx on public.support_access_grants(created_by);
create index if not exists support_access_grants_ended_by_idx on public.support_access_grants(ended_by);

alter table public.support_access_grants enable row level security;

-- O suporte tem acesso ativo a esta empresa? (código usado por ele, dentro do prazo e não encerrado)
create or replace function private.has_support_access(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.support_access_grants g
    where g.organization_id = target_org
      and g.redeemed_by = (select auth.uid())
      and g.ended_at is null
      and g.access_expires_at > now()
  ) and exists (
    -- Só vale enquanto a pessoa continuar sendo Super Admin.
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid()) and pa.role = 'super_admin'
  );
$$;

-- Vínculo real com a empresa (sem contar acesso de suporte).
create or replace function private.is_org_member(target_org uuid, allowed_roles text[] default array['owner', 'admin', 'manager', 'agent'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships om
    where om.organization_id = target_org
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$$;

-- Papel na empresa: vínculo ativo OU acesso de suporte autorizado pelo cliente (vale como dono).
create or replace function private.has_org_role(
  target_org uuid,
  allowed_roles text[] default array['owner', 'admin', 'manager', 'agent']
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_member(target_org, allowed_roles) or private.has_support_access(target_org);
$$;

-- Quem vê os registros: dono/administrador da empresa (histórico de acessos) e o Super Admin (auditoria).
-- Ninguém grava direto na tabela: só pelas funções abaixo.
drop policy if exists support_access_grants_select on public.support_access_grants;
create policy support_access_grants_select on public.support_access_grants
  for select to authenticated
  using (private.is_org_member(organization_id, array['owner', 'admin']) or private.is_platform_super_admin());

-- O resumo do código não sai do banco.
revoke select on public.support_access_grants from authenticated, anon;
grant select (id, organization_id, access_hours, reason, created_by, created_at, code_expires_at, redeemed_by, redeemed_at, access_expires_at, ended_at, ended_by)
  on public.support_access_grants to authenticated;

-- 1) Cliente gera o código. Retorna o código em texto UMA vez.
create or replace function public.create_support_code(p_organization_id uuid, p_access_hours integer default 2, p_reason text default null)
returns table(code text, code_expires_at timestamptz, access_hours integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if not private.is_org_member(p_organization_id, array['owner', 'admin']) then
    raise exception 'Somente o dono ou um administrador da empresa pode liberar o acesso do suporte.' using errcode = '42501';
  end if;
  if p_access_hours is null or p_access_hours < 1 or p_access_hours > 24 then
    raise exception 'O acesso pode durar de 1 a 24 horas.';
  end if;

  -- Códigos antigos ainda não usados deixam de valer.
  update public.support_access_grants g
     set ended_at = now(), ended_by = (select auth.uid())
   where g.organization_id = p_organization_id and g.redeemed_at is null and g.ended_at is null;

  -- 8 dígitos aleatórios (gerador criptográfico), sempre com 8 casas.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 100000000)::text, 8, '0');

  insert into public.support_access_grants (organization_id, code_hash, access_hours, reason, created_by, code_expires_at)
  values (p_organization_id, encode(extensions.digest(v_code, 'sha256'), 'hex'), p_access_hours, nullif(trim(coalesce(p_reason, '')), ''), (select auth.uid()), v_expires);

  return query select v_code, v_expires, p_access_hours;
end;
$$;

-- 2) Suporte usa o código. Retorna a empresa liberada e o prazo.
create or replace function public.redeem_support_code(p_code text)
returns table(organization_id uuid, organization_name text, access_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.support_access_grants%rowtype;
  v_digits text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_until timestamptz;
begin
  if not private.is_platform_super_admin() then
    raise exception 'Acesso restrito ao Super Admin.' using errcode = '42501';
  end if;
  if length(v_digits) <> 8 then
    raise exception 'O código de suporte tem 8 dígitos.';
  end if;

  select * into v_grant
    from public.support_access_grants g
   where g.code_hash = encode(extensions.digest(v_digits, 'sha256'), 'hex')
     and g.redeemed_at is null and g.ended_at is null and g.code_expires_at > now()
   order by g.created_at desc
   limit 1
   for update;
  if not found then
    raise exception 'Código inválido ou vencido. Peça ao cliente para gerar um novo.';
  end if;

  v_until := now() + make_interval(hours => v_grant.access_hours);
  update public.support_access_grants g
     set redeemed_by = (select auth.uid()), redeemed_at = now(), access_expires_at = v_until
   where g.id = v_grant.id;

  return query
    select o.id, o.name, v_until from public.organizations o where o.id = v_grant.organization_id;
end;
$$;

-- 3) Encerrar: o cliente (dono/admin) encerra qualquer acesso da empresa; o suporte encerra o próprio.
create or replace function public.end_support_access(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_is_admin boolean := private.is_org_member(p_organization_id, array['owner', 'admin']);
begin
  update public.support_access_grants g
     set ended_at = now(), ended_by = (select auth.uid())
   where g.organization_id = p_organization_id
     and g.ended_at is null
     and (v_is_admin or g.redeemed_by = (select auth.uid()));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_support_code(uuid, integer, text) from public, anon;
revoke all on function public.redeem_support_code(text) from public, anon;
revoke all on function public.end_support_access(uuid) from public, anon;
grant execute on function public.create_support_code(uuid, integer, text) to authenticated;
grant execute on function public.redeem_support_code(text) to authenticated;
grant execute on function public.end_support_access(uuid) to authenticated;

-- Workspace interno da plataforma (slug "tendi"): é a empresa da própria Tendi, então os Super Admins
-- trabalham nela como donos. Isso não muda nada nas empresas dos clientes.
insert into public.organization_memberships (organization_id, user_id, role, status)
select o.id, pa.user_id, 'owner', 'active'
  from public.organizations o
  cross join public.platform_admins pa
 where o.slug = 'tendi' and pa.role = 'super_admin'
   and not exists (
     select 1 from public.organization_memberships m
      where m.organization_id = o.id and m.user_id = pa.user_id
   );

update public.organization_memberships m
   set role = 'owner', status = 'active'
  from public.organizations o, public.platform_admins pa
 where m.organization_id = o.id and o.slug = 'tendi'
   and m.user_id = pa.user_id and pa.role = 'super_admin'
   and (m.status <> 'active' or m.role <> 'owner');
