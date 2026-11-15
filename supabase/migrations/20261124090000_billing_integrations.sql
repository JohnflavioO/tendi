-- Segunda via de boleto (plano Pro): a empresa conecta o sistema de cobrança dela (começando pelo
-- Asaas) e a Duda envia ao cliente final a linha digitável e o PDF do boleto em aberto.
--
-- 1) billing_integrations: uma linha por empresa e provedor, só com dados que não são segredo
--    (status, ambiente, nome da conta, 4 últimos caracteres da chave). A equipe da empresa lê;
--    quem grava é o servidor (rotas /api/integrations/boleto), que também guarda a chave no Vault.
-- 2) Chave de API do provedor no Vault, como os tokens dos canais: só a chave de serviço grava e lê.

-- 1) Integrações de cobrança ----------------------------------------------------------------------
create table if not exists public.billing_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('asaas')),
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  account_label text check (account_label is null or char_length(account_label) <= 120),
  key_hint text check (key_hint is null or char_length(key_hint) <= 8),
  is_enabled boolean not null default true,
  last_verified_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

drop trigger if exists billing_integrations_set_updated_at on public.billing_integrations;
create trigger billing_integrations_set_updated_at before update on public.billing_integrations
  for each row execute function private.set_updated_at();

alter table public.billing_integrations enable row level security;

-- Leitura para quem configura a empresa. Nenhuma policy de escrita: só o servidor grava.
drop policy if exists billing_integrations_select on public.billing_integrations;
create policy billing_integrations_select on public.billing_integrations
  for select to authenticated using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
revoke insert, update, delete on public.billing_integrations from authenticated, anon;

-- 2) Chave de API do provedor, no Vault -------------------------------------------------------------
create or replace function public.set_billing_secret(p_integration_id uuid, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_vault_name text := 'tendi_billing_key_' || p_integration_id::text;
  v_id uuid;
  v_value text := btrim(coalesce(p_value, ''));
begin
  if not exists (select 1 from public.billing_integrations where id = p_integration_id) then
    raise exception 'Integração não encontrada.';
  end if;
  select id into v_id from vault.secrets where name = v_vault_name;
  if v_value = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(v_value, v_vault_name, 'Chave do sistema de cobrança ' || p_integration_id::text);
  else
    perform vault.update_secret(v_id, v_value);
  end if;
end;
$fn$;

create or replace function public.get_billing_secret(p_integration_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $fn$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'tendi_billing_key_' || p_integration_id::text
  limit 1;
$fn$;

revoke all on function public.set_billing_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.get_billing_secret(uuid) from public, anon, authenticated;
grant execute on function public.set_billing_secret(uuid, text) to service_role;
grant execute on function public.get_billing_secret(uuid) to service_role;

-- Apaga a chave do Vault quando a integração some (inclusive quando a empresa é excluída).
create or replace function private.cleanup_billing_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from vault.secrets where name = 'tendi_billing_key_' || old.id::text;
  return old;
end;
$fn$;

drop trigger if exists billing_integrations_cleanup_secret on public.billing_integrations;
create trigger billing_integrations_cleanup_secret after delete on public.billing_integrations
  for each row execute function private.cleanup_billing_secret();
