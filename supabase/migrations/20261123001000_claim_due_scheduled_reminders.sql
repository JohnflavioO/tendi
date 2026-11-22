-- Atomically claim due reminders to prevent duplicate processing across concurrent cron invocations.
create or replace function public.claim_due_scheduled_reminders(batch_size integer default 20)
returns setof public.scheduled_reminders
language plpgsql security definer set search_path = public
as $$
begin
 if current_user not in ('postgres', 'service_role') then
  raise exception 'Not authorized';
 end if;
 return query
 with due as (
   select id from public.scheduled_reminders
   where status='scheduled' and scheduled_at <= now()
   order by scheduled_at asc
   for update skip locked
   limit least(greatest(batch_size, 1), 50)
 )
 update public.scheduled_reminders r
 set status='processing', updated_at=now()
 from due where r.id=due.id
 returning r.*;
end;
$$;
revoke all on function public.claim_due_scheduled_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_reminders(integer) to service_role;
