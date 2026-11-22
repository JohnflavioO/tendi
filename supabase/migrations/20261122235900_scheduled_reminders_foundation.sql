-- Central de lembretes: somente cadastro, sem disparo até o worker estar pronto.
create table if not exists public.scheduled_reminders (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 recipient_type text not null check (recipient_type in ('me','client','team')),
 recipient_user_id uuid references auth.users(id),
 contact_id uuid references public.contacts(id),
 channel text not null check (channel in ('push','whatsapp','both')),
 title text not null check (char_length(trim(title)) between 1 and 120),
 message text not null check (char_length(trim(message)) between 1 and 2000),
 scheduled_at timestamptz not null,
 status text not null default 'scheduled' check (status in ('scheduled','processing','sent','partial','failed','cancelled')),
 push_status text not null default 'pending' check (push_status in ('pending','sent','failed','skipped')),
 whatsapp_status text not null default 'pending' check (whatsapp_status in ('pending','sent','failed','skipped')),
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint reminder_recipient check (
  (recipient_type='me' and recipient_user_id=created_by and contact_id is null) or
  (recipient_type='team' and recipient_user_id is not null and contact_id is null) or
  (recipient_type='client' and contact_id is not null and recipient_user_id is null)
 )
);
create index if not exists scheduled_reminders_due_idx on public.scheduled_reminders (scheduled_at) where status='scheduled';
create index if not exists scheduled_reminders_org_idx on public.scheduled_reminders (organization_id,created_at desc);
alter table public.scheduled_reminders enable row level security;
grant select,insert,update on public.scheduled_reminders to authenticated;
create policy "reminders_select" on public.scheduled_reminders for select to authenticated
 using (exists(select 1 from public.organization_memberships m where m.organization_id=scheduled_reminders.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy "reminders_insert" on public.scheduled_reminders for insert to authenticated
 with check (
  created_by=(select auth.uid()) and status='scheduled' and push_status='pending' and whatsapp_status='pending'
  and scheduled_at>now()
  and exists(select 1 from public.organization_memberships m where m.organization_id=scheduled_reminders.organization_id and m.user_id=(select auth.uid()) and m.status='active')
  and (recipient_type!='team' or exists(select 1 from public.organization_memberships m where m.organization_id=scheduled_reminders.organization_id and m.user_id=scheduled_reminders.recipient_user_id and m.status='active'))
  and (recipient_type!='client' or exists(select 1 from public.contacts c where c.id=scheduled_reminders.contact_id and c.organization_id=scheduled_reminders.organization_id))
 );
-- Não conceder UPDATE direto ao cliente: cancelamento validado em rota autenticada posteriormente.
revoke update on public.scheduled_reminders from authenticated;
