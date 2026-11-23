-- Consentimento WhatsApp: metadados e trilha de auditoria sem alterar conexões.
alter table public.contacts
  add column if not exists whatsapp_consent_source text,
  add column if not exists whatsapp_consent_at timestamptz,
  add column if not exists whatsapp_consent_by uuid,
  add column if not exists whatsapp_consent_note text;
alter table public.contacts drop constraint if exists contacts_whatsapp_consent_source_check;
alter table public.contacts add constraint contacts_whatsapp_consent_source_check
  check (whatsapp_consent_source is null or whatsapp_consent_source in ('whatsapp','form','attendance','self_test'));
create table if not exists public.contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  opted_in boolean not null,
  source text,
  note text,
  actor_id uuid,
  occurred_at timestamptz not null default now()
);
alter table public.contact_consent_events enable row level security;
drop policy if exists contact_consent_events_select on public.contact_consent_events;
create policy contact_consent_events_select on public.contact_consent_events
  for select to authenticated using (private.has_org_role(organization_id));
revoke insert, update, delete on public.contact_consent_events from anon, authenticated;
grant select on public.contact_consent_events to authenticated;
create or replace function public.audit_contact_whatsapp_consent()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.opt_in is not distinct from new.opt_in then return new; end if;
  if new.opt_in then
    if new.whatsapp_consent_source is null then
      raise exception 'Informe a origem da autorização de WhatsApp.';
    end if;
    new.whatsapp_consent_at := coalesce(new.whatsapp_consent_at, now());
  else
    new.whatsapp_consent_at := now();
  end if;
  new.whatsapp_consent_by := coalesce(auth.uid(), new.whatsapp_consent_by);
  insert into public.contact_consent_events(organization_id,contact_id,opted_in,source,note,actor_id)
  values(new.organization_id,new.id,new.opt_in,new.whatsapp_consent_source,new.whatsapp_consent_note,auth.uid());
  return new;
end $$;
-- BEFORE trigger cannot insert audit rows for a newly created contact (FK not yet present);
-- restrict auditing to updates and retain existing opt_in values without rewriting them.
drop trigger if exists audit_contact_whatsapp_consent_update on public.contacts;
create trigger audit_contact_whatsapp_consent_update
  before update of opt_in on public.contacts
  for each row execute function public.audit_contact_whatsapp_consent();
