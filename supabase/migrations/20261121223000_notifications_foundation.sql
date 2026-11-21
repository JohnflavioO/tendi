-- TendiDesk notifications foundation. Review and deploy separately; do not execute on production as part of this PR.
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check (length(event_type) between 1 and 80),
 title text not null check (length(title) between 1 and 200),
 body text,
 target_path text check (target_path is null or (left(target_path,1)='/' and left(target_path,2)<>'//' and position('\\' in target_path)=0)),
 deduplication_key text,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 unique (organization_id, recipient_user_id, deduplication_key)
);
create index if not exists notifications_recipient_recent_idx on public.notifications (recipient_user_id, organization_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_user_id, organization_id, created_at desc) where read_at is null;

create table if not exists public.notification_preferences (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check (length(event_type) between 1 and 80),
 in_app_enabled boolean not null default true,
 push_enabled boolean not null default true,
 email_enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key (organization_id, user_id, event_type)
);

create table if not exists public.push_devices (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 fcm_token text not null unique,
 platform text not null check (platform in ('web','android','ios')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_seen_at timestamptz
);
create index if not exists push_devices_owner_idx on public.push_devices (user_id, organization_id);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;

-- Membership must remain active, and profile must not be blocked.
-- Keep authorization checks scoped to the exact organization and recipient.
create policy notifications_read_own on public.notifications for select to authenticated
 using (recipient_user_id = (select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notifications.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ));
create policy notifications_mark_own_read on public.notifications for update to authenticated
 using (recipient_user_id = (select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notifications.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ))
 with check (recipient_user_id = (select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notifications.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ));
-- No client INSERT or DELETE policy on notifications. Restrict column updates to read_at.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy preferences_read_own on public.notification_preferences for select to authenticated
 using (user_id=(select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notification_preferences.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ));
create policy preferences_insert_own on public.notification_preferences for insert to authenticated
 with check (user_id=(select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notification_preferences.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ));
create policy preferences_update_own on public.notification_preferences for update to authenticated
 using (user_id=(select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notification_preferences.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ))
 with check (user_id=(select auth.uid()) and exists (
 select 1 from public.organization_memberships m join public.profiles p on p.id=m.user_id
 where m.organization_id=notification_preferences.organization_id and m.user_id=(select auth.uid())
 and m.status='active' and p.is_active=true
 ));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert on public.notification_preferences to authenticated;
grant update (in_app_enabled,push_enabled,email_enabled,updated_at) on public.notification_preferences to authenticated;

-- Device tokens must never be exposed to clients via SELECT.
-- Device enrollment/revocation is handled by a server-side endpoint after auth + membership verification.
revoke all on public.push_devices from anon, authenticated;
