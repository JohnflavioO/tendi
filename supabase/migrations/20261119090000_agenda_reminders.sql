-- Lembretes automáticos da agenda (confirmação por WhatsApp).
--
-- 1) Configuração por empresa (ligado/desligado, antecedência e texto) e controle de envio por agendamento.
-- 2) Agendador: o próprio banco chama o app a cada 10 minutos (pg_cron + pg_net), sem depender do
--    plano de hospedagem. O app envia os lembretes que estiverem na hora.
--
-- Segurança do agendador: o segredo que autoriza a chamada é gerado AQUI, dentro do banco, e nunca
-- sai dele por chat, e-mail ou variável de ambiente. O app confere o segredo lendo esta mesma tabela
-- com a chave de serviço. O endereço do app (platform_settings 'app_url') não é segredo e precisa ser
-- preenchido uma vez; enquanto estiver vazio, o agendador não faz nada.

alter table public.organizations
  add column if not exists agenda_settings jsonb not null default '{}'::jsonb;

alter table public.appointments
  add column if not exists reminder_status text,
  add column if not exists reminder_error text,
  add column if not exists reminder_reply text,
  add column if not exists reschedule_requested_at timestamptz;

alter table public.appointments drop constraint if exists appointments_reminder_status_check;
alter table public.appointments
  add constraint appointments_reminder_status_check
  check (reminder_status is null or reminder_status in ('sent', 'failed'));

alter table public.appointments drop constraint if exists appointments_reminder_reply_check;
alter table public.appointments
  add constraint appointments_reminder_reply_check
  check (reminder_reply is null or reminder_reply in ('confirmed', 'reschedule'));

-- Respostas ao lembrete: acha rápido o agendamento do contato que recebeu aviso.
create index if not exists appointments_contact_reminder_idx on public.appointments(contact_id, starts_at)
  where reminder_status = 'sent' and status = 'scheduled';

insert into public.platform_settings (key, value, description)
values
  ('app_url', 'null'::jsonb, 'Endereço público do app (ex.: https://app.exemplo.com). Usado pelo agendador de lembretes.'),
  ('cron_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), 'Segredo interno que autoriza o agendador a chamar o app. Gerado pelo banco.')
on conflict (key) do nothing;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Chama o app para enviar os lembretes que estiverem na hora. Não faz nada sem o endereço do app.
create or replace function private.trigger_agenda_reminders()
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
    url := rtrim(v_url, '/') || '/api/cron/agenda-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.trigger_agenda_reminders() from public;
revoke all on function private.trigger_agenda_reminders() from anon;
revoke all on function private.trigger_agenda_reminders() from authenticated;

-- (Re)agenda a execução a cada 10 minutos.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tendi-agenda-reminders') then
    perform cron.unschedule('tendi-agenda-reminders');
  end if;
  perform cron.schedule('tendi-agenda-reminders', '*/10 * * * *', 'select private.trigger_agenda_reminders()');
end;
$$;
