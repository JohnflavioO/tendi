-- Agenda: profissionais, serviços, horários de atendimento e agendamentos.
-- Serve qualquer negócio que atende com hora marcada (clínicas, barbearias, estúdios, consultórios).
--
-- Acesso: todo membro ativo da empresa vê a agenda e cria/altera agendamentos.
-- Profissionais, serviços e horários são configurados por dono, administrador e supervisor.
-- O Super Admin da plataforma NÃO tem acesso: agendamentos são dados dos clientes da empresa.

create extension if not exists btree_gist with schema extensions;

-- Fuso horário da empresa: usado para montar os horários do dia e, depois, pelos lembretes automáticos.
alter table public.organizations
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists business_segment text;

alter table public.organizations drop constraint if exists organizations_business_segment_check;
alter table public.organizations
  add constraint organizations_business_segment_check
  check (business_segment is null or business_segment in ('clinic', 'barbershop', 'beauty', 'other'));

create table if not exists public.agenda_professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  -- Vínculo opcional com o usuário do Tendi que é esse profissional.
  user_id uuid references auth.users(id) on delete set null,
  color text not null default '#004751' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_professionals_org_idx on public.agenda_professionals(organization_id);
create index if not exists agenda_professionals_user_idx on public.agenda_professionals(user_id);

create table if not exists public.agenda_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_cents integer check (price_cents is null or price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_services_org_idx on public.agenda_services(organization_id);

-- Horário de atendimento semanal de cada profissional (0 = domingo ... 6 = sábado).
-- Mais de uma linha no mesmo dia representa turnos (ex.: 08:00-12:00 e 14:00-18:00).
create table if not exists public.agenda_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.agenda_professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts time not null,
  ends time not null,
  check (ends > starts)
);
create index if not exists agenda_hours_org_idx on public.agenda_hours(organization_id);
create index if not exists agenda_hours_professional_idx on public.agenda_hours(professional_id, weekday);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.agenda_professionals(id) on delete restrict,
  service_id uuid references public.agenda_services(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 120),
  customer_phone text check (customer_phone is null or customer_phone ~ '^\+?[0-9]{8,15}$'),
  service_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Quem marcou: equipe pelo painel ('manual'), agente de IA ('ai') ou o próprio cliente ('customer').
  source text not null default 'manual' check (source in ('manual', 'ai', 'customer')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  reminder_sent_at timestamptz,
  confirmed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  -- O banco impede dois agendamentos ativos no mesmo horário para o mesmo profissional.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed', 'completed'))
);
create index if not exists appointments_org_starts_idx on public.appointments(organization_id, starts_at);
create index if not exists appointments_service_idx on public.appointments(service_id);
create index if not exists appointments_contact_idx on public.appointments(contact_id);
create index if not exists appointments_conversation_idx on public.appointments(conversation_id);
create index if not exists appointments_created_by_idx on public.appointments(created_by);
-- Lembretes: agendamentos futuros ainda sem aviso enviado.
create index if not exists appointments_reminder_idx on public.appointments(starts_at)
  where reminder_sent_at is null and status in ('scheduled', 'confirmed');

drop trigger if exists agenda_professionals_set_updated_at on public.agenda_professionals;
create trigger agenda_professionals_set_updated_at before update on public.agenda_professionals
  for each row execute function private.set_updated_at();
drop trigger if exists agenda_services_set_updated_at on public.agenda_services;
create trigger agenda_services_set_updated_at before update on public.agenda_services
  for each row execute function private.set_updated_at();
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();

alter table public.agenda_professionals enable row level security;
alter table public.agenda_services enable row level security;
alter table public.agenda_hours enable row level security;
alter table public.appointments enable row level security;

-- Configuração da agenda: todos da empresa leem; dono, administrador e supervisor alteram.
drop policy if exists agenda_professionals_select on public.agenda_professionals;
create policy agenda_professionals_select on public.agenda_professionals
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists agenda_professionals_manage on public.agenda_professionals;
create policy agenda_professionals_manage on public.agenda_professionals
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists agenda_services_select on public.agenda_services;
create policy agenda_services_select on public.agenda_services
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists agenda_services_manage on public.agenda_services;
create policy agenda_services_manage on public.agenda_services
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

drop policy if exists agenda_hours_select on public.agenda_hours;
create policy agenda_hours_select on public.agenda_hours
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists agenda_hours_manage on public.agenda_hours;
create policy agenda_hours_manage on public.agenda_hours
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']))
  with check (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));

-- Agendamentos: todos da empresa veem, criam e alteram; só gestores apagam (o normal é cancelar).
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select to authenticated using (private.has_org_role(organization_id));
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments
  for insert to authenticated with check (private.has_org_role(organization_id));
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments
  for update to authenticated
  using (private.has_org_role(organization_id))
  with check (private.has_org_role(organization_id));
drop policy if exists appointments_delete on public.appointments;
create policy appointments_delete on public.appointments
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin', 'manager']));
