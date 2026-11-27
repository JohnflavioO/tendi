-- Campanhas de marketing: disparo de WhatsApp para um segmento de contatos (ex.: quem veio pelo
-- Agendar), respeitando sempre o opt-in de WhatsApp do contato — nunca envia promoção pra quem
-- não autorizou. Criação e processamento do envio ficam só no servidor (chave de serviço): o
-- cliente da sessão só lê o progresso, nunca grava diretamente nessas tabelas.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  -- Segmento alvo: hoje só a etiqueta de contacts.tags (ex.: 'agendar').
  tag text not null check (char_length(tag) between 1 and 40),
  status text not null default 'sending' check (status in ('sending', 'completed', 'cancelled')),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists campaigns_org_idx on public.campaigns(organization_id, created_at desc);
-- Processamento do cron: campanhas ainda em andamento.
create index if not exists campaigns_sending_idx on public.campaigns(status) where status = 'sending';

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Processamento do cron: próximos pendentes de uma campanha.
create index if not exists campaign_recipients_pending_idx on public.campaign_recipients(campaign_id)
  where status = 'pending';

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

-- Leitura: todo membro ativo da empresa acompanha o progresso. Escrita: só a chave de serviço
-- (criação e processamento do envio ficam nas rotas /api/campaigns e /api/cron/campaigns).
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select to authenticated using (private.has_org_role(organization_id));

drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients
  for select to authenticated using (private.has_org_role(organization_id));

-- Agendador: processa o lote de envios pendentes a cada minuto, reaproveitando o mesmo segredo
-- e endereço do app já usados pelos lembretes da agenda.
create or replace function private.trigger_campaigns()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value #>> '{}' into v_url from public.platform_settings where key = 'app_url';
  select value #>> '{}' into v_secret from public.platform_settings where key = 'cron_secret';
  if v_url is null or v_url !~ '^https://[^/[:space:]]+' or v_secret is null or length(v_secret) < 32 then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/campaigns',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.trigger_campaigns() from public;
revoke all on function private.trigger_campaigns() from anon;
revoke all on function private.trigger_campaigns() from authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tendi-campaigns') then
    perform cron.unschedule('tendi-campaigns');
  end if;
  perform cron.schedule('tendi-campaigns', '* * * * *', 'select private.trigger_campaigns()');
end;
$$;
