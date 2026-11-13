-- Canais além do WhatsApp: Webchat (widget para o site do cliente) e, preparando o terreno,
-- Instagram e Messenger (Meta). Cada canal entra na mesma Inbox, no mesmo CRM, na mesma agenda.
--
-- 1) Amplia os valores aceitos em conversations.channel e channel_connections.channel.
-- 2) Webchat: widget por empresa e sessão do visitante. O visitante nunca fala direto com o
--    Supabase: só com as rotas /api/webchat/*, que usam a chave de serviço. Por isso
--    webchat_sessions não tem nenhuma policy para authenticated/anon.
-- 3) Contacts ganha external_id, para identificar quem escreve por um canal sem telefone
--    (Instagram/Messenger usam um ID da plataforma, não um número).
-- 4) Token de acesso de cada conexão (ex.: token da página/conta da Meta) guardado no Vault,
--    nunca em uma coluna que o workspace consiga ler. Só o servidor (chave de serviço) grava e lê.

-- 1) Canais aceitos -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.conversations'::regclass, 'public.channel_connections'::regclass)
      and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.conversations
  add constraint conversations_channel_check check (channel in ('whatsapp', 'webchat', 'instagram', 'messenger'));
alter table public.channel_connections
  add constraint channel_connections_channel_check check (channel in ('whatsapp', 'webchat', 'instagram', 'messenger'));

-- 2) Webchat --------------------------------------------------------------------------------------
create table if not exists public.webchat_widgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  public_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_enabled boolean not null default false,
  display_name text not null default 'Atendimento' check (char_length(trim(display_name)) between 1 and 60),
  greeting_message text not null default 'Olá! Como podemos ajudar?' check (char_length(greeting_message) <= 300),
  color text not null default '#004751' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists webchat_widgets_set_updated_at on public.webchat_widgets;
create trigger webchat_widgets_set_updated_at before update on public.webchat_widgets
  for each row execute function private.set_updated_at();

alter table public.webchat_widgets enable row level security;

drop policy if exists webchat_widgets_select on public.webchat_widgets;
create policy webchat_widgets_select on public.webchat_widgets
  for select to authenticated using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
drop policy if exists webchat_widgets_manage on public.webchat_widgets;
create policy webchat_widgets_manage on public.webchat_widgets
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));

-- Sessão do visitante: liga o navegador dele (sem conta, sem senha) a um contato e uma conversa.
-- Ninguém além do servidor acessa esta tabela; o token do visitante nunca fica em texto puro aqui.
create table if not exists public.webchat_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists webchat_sessions_org_idx on public.webchat_sessions(organization_id);
create index if not exists webchat_sessions_conversation_idx on public.webchat_sessions(conversation_id);

alter table public.webchat_sessions enable row level security;
revoke all on public.webchat_sessions from authenticated, anon;
-- Sem nenhuma policy criada de propósito: RLS ligado + zero policy = ninguém além do dono da
-- tabela (e da chave de serviço, que ignora RLS) lê ou grava aqui.

-- 3) Contato sem telefone (Instagram/Messenger identificam a pessoa por um ID da plataforma) -------
alter table public.contacts add column if not exists external_id text;
create unique index if not exists contacts_external_id_idx
  on public.contacts(organization_id, external_id) where external_id is not null;

-- 4) Token de acesso de cada conexão, no Vault -----------------------------------------------------
create or replace function public.set_channel_secret(p_connection_id uuid, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_vault_name text := 'tendi_channel_token_' || p_connection_id::text;
  v_id uuid;
  v_value text := btrim(coalesce(p_value, ''));
begin
  if not exists (select 1 from public.channel_connections where id = p_connection_id) then
    raise exception 'Conexão não encontrada.';
  end if;
  select id into v_id from vault.secrets where name = v_vault_name;
  if v_value = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(v_value, v_vault_name, 'Token de acesso do canal ' || p_connection_id::text);
  else
    perform vault.update_secret(v_id, v_value);
  end if;
end;
$fn$;

create or replace function public.get_channel_secret(p_connection_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $fn$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'tendi_channel_token_' || p_connection_id::text
  limit 1;
$fn$;

revoke all on function public.set_channel_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.get_channel_secret(uuid) from public, anon, authenticated;
grant execute on function public.set_channel_secret(uuid, text) to service_role;
grant execute on function public.get_channel_secret(uuid) to service_role;

-- Remove o segredo guardado quando a conexão é apagada (desconectar não apaga a linha; excluir a
-- empresa, sim, em cascata). Evita segredo órfão no Vault.
create or replace function private.cleanup_channel_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from vault.secrets where name = 'tendi_channel_token_' || old.id::text;
  return old;
end;
$fn$;

drop trigger if exists channel_connections_cleanup_secret on public.channel_connections;
create trigger channel_connections_cleanup_secret after delete on public.channel_connections
  for each row execute function private.cleanup_channel_secret();
