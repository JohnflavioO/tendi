-- Allow the author to edit pending reminders and delete their own reminders.
-- Worker-owned delivery/status fields are not writable by authenticated users.
revoke update on public.scheduled_reminders from authenticated;
grant update (recipient_type,recipient_user_id,contact_id,channel,title,message,scheduled_at,updated_at)
 on public.scheduled_reminders to authenticated;
create policy "reminders_update_own_scheduled"
 on public.scheduled_reminders for update to authenticated
 using (
   created_by=(select auth.uid()) and status='scheduled'
   and exists (select 1 from public.organization_memberships m
      where m.organization_id=scheduled_reminders.organization_id
      and m.user_id=(select auth.uid()) and m.status='active')
 )
 with check (
   created_by=(select auth.uid()) and status='scheduled'
   and scheduled_at>now()
   and exists (select 1 from public.organization_memberships m
      where m.organization_id=scheduled_reminders.organization_id
      and m.user_id=(select auth.uid()) and m.status='active')
   and (recipient_type!='team' or exists (select 1 from public.organization_memberships m
      where m.organization_id=scheduled_reminders.organization_id
      and m.user_id=scheduled_reminders.recipient_user_id and m.status='active'))
   and (recipient_type!='client' or exists (select 1 from public.contacts c
      where c.id=scheduled_reminders.contact_id
      and c.organization_id=scheduled_reminders.organization_id))
 );
grant delete on public.scheduled_reminders to authenticated;
create policy "reminders_delete_own_except_processing"
 on public.scheduled_reminders for delete to authenticated
 using (
   created_by=(select auth.uid()) and status!='processing'
   and exists (select 1 from public.organization_memberships m
      where m.organization_id=scheduled_reminders.organization_id
      and m.user_id=(select auth.uid()) and m.status='active')
 );
