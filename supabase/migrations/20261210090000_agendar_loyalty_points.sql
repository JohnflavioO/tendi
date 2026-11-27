-- Fidelidade por pontos: quando a equipe marca um agendamento como "Atendido", o cliente ganha
-- pontos automaticamente — configurável pelo estabelecimento (liga/desliga e quantos pontos por
-- atendimento concluído). Implementado como gatilho no próprio banco: funciona não importa qual
-- caminho muda o status pra "completed" (painel, API, automação futura), sem depender de nenhum
-- código de aplicação lembrar de chamar isso.

alter table public.contacts add column if not exists loyalty_points integer not null default 0 check (loyalty_points >= 0);

create table if not exists public.loyalty_point_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Agendamento que gerou os pontos. Um só evento por agendamento (ver índice único abaixo):
  -- mudar o status de um lado pro outro várias vezes nunca credita pontos em dobro.
  appointment_id uuid references public.appointments(id) on delete set null,
  points integer not null check (points <> 0),
  reason text not null default 'completed_appointment',
  created_at timestamptz not null default now()
);
create unique index if not exists loyalty_point_events_appointment_unique
  on public.loyalty_point_events(appointment_id) where appointment_id is not null;
create index if not exists loyalty_point_events_contact_idx on public.loyalty_point_events(contact_id, created_at desc);

alter table public.loyalty_point_events enable row level security;
drop policy if exists loyalty_point_events_select on public.loyalty_point_events;
create policy loyalty_point_events_select on public.loyalty_point_events
  for select to authenticated using (private.has_org_role(organization_id));

-- Configuração por empresa: organizations.agenda_settings->loyalty = { enabled, pointsPerVisit }.
create or replace function private.award_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_points integer;
begin
  -- Só credita na transição PARA "completed" (nunca de novo se já estava completed).
  if new.status is distinct from 'completed' or old.status is not distinct from 'completed' or new.contact_id is null then
    return new;
  end if;

  select coalesce((agenda_settings->'loyalty'->>'enabled')::boolean, false),
         coalesce((agenda_settings->'loyalty'->>'pointsPerVisit')::integer, 0)
    into v_enabled, v_points
    from public.organizations where id = new.organization_id;
  if not v_enabled or v_points is null or v_points <= 0 then
    return new;
  end if;

  insert into public.loyalty_point_events (organization_id, contact_id, appointment_id, points, reason)
  values (new.organization_id, new.contact_id, new.id, v_points, 'completed_appointment')
  on conflict (appointment_id) where appointment_id is not null do nothing;

  if found then
    update public.contacts set loyalty_points = loyalty_points + v_points where id = new.contact_id;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_award_loyalty_points on public.appointments;
create trigger appointments_award_loyalty_points
  after update of status on public.appointments
  for each row execute function private.award_loyalty_points();
