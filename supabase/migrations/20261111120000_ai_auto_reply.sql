-- Agente de IA (Etapa B: resposta automática).
-- Migração somente aditiva:
--   1) chaves de API de IA guardadas no Supabase Vault (cadastradas pelo Super Admin no painel);
--   2) trava por conversa para a IA nunca responder duas vezes à mesma mensagem;
--   3) registro de uso da IA (tokens por resposta), base para limites e cobrança.

-- 1) Chaves de API no Vault -----------------------------------------------------------------------
-- As funções rodam com os privilégios do dono (security definer) e só a chave de serviço
-- (service_role, usada no servidor) pode chamá-las. Nem usuários logados nem anônimos executam.

create or replace function public.set_ai_provider_key(p_provider text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_id uuid;
  v_key text := btrim(coalesce(p_key, ''));
begin
  if p_provider not in ('anthropic', 'openai') then
    raise exception 'Provedor de IA inválido: %', p_provider;
  end if;
  v_name := 'tendi_ai_key_' || p_provider;
  select id into v_id from vault.secrets where name = v_name;

  if v_key = '' then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
    end if;
    return;
  end if;

  if v_id is null then
    perform vault.create_secret(v_key, v_name, 'Chave de API de IA (' || p_provider || ') cadastrada pelo Super Admin');
  else
    perform vault.update_secret(v_id, v_key);
  end if;
end;
$fn$;

create or replace function public.get_ai_provider_key(p_provider text)
returns text
language sql
security definer
set search_path = ''
stable
as $fn$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'tendi_ai_key_' || p_provider
  limit 1;
$fn$;

-- Situação das chaves sem revelar o valor: só os 4 últimos caracteres.
create or replace function public.get_ai_provider_key_status()
returns table (provider text, configured boolean, hint text, updated_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $fn$
  select p.provider,
         s.decrypted_secret is not null,
         case when s.decrypted_secret is null then null else right(s.decrypted_secret, 4) end,
         s.updated_at
  from (values ('anthropic'), ('openai')) as p(provider)
  left join vault.decrypted_secrets s on s.name = 'tendi_ai_key_' || p.provider;
$fn$;

revoke all on function public.set_ai_provider_key(text, text) from public, anon, authenticated;
revoke all on function public.get_ai_provider_key(text) from public, anon, authenticated;
revoke all on function public.get_ai_provider_key_status() from public, anon, authenticated;
grant execute on function public.set_ai_provider_key(text, text) to service_role;
grant execute on function public.get_ai_provider_key(text) to service_role;
grant execute on function public.get_ai_provider_key_status() to service_role;

-- 2) Trava de resposta por conversa ---------------------------------------------------------------
alter table public.conversations
  add column if not exists ai_replied_to_message_id uuid;

-- 3) Uso da IA ------------------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  outcome text not null check (outcome in ('replied', 'handoff', 'limit', 'error')),
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_org_created_idx on public.ai_usage_events(organization_id, created_at desc);
create index if not exists ai_usage_events_conversation_created_idx on public.ai_usage_events(conversation_id, created_at desc);
alter table public.ai_usage_events enable row level security;

-- Leitura: Super Admin e gestores da empresa. Gravação: só o servidor (chave de serviço ignora RLS).
drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select to authenticated
  using (private.is_platform_super_admin() or private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

update public.platform_settings
set description = 'Provedor e modelo padrão dos agentes de IA. As chaves de API ficam no Supabase Vault (cadastradas pelo Super Admin) ou em variáveis de ambiente do servidor.'
where key = 'ai';
