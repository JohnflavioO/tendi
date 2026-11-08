drop policy if exists platform_admin_allowlist_select on public.platform_admin_allowlist;
create policy platform_admin_allowlist_select on public.platform_admin_allowlist
for select to authenticated using (private.is_platform_super_admin());

create index if not exists channel_connections_org_idx on public.channel_connections(organization_id);
create index if not exists contacts_created_by_idx on public.contacts(created_by);
create index if not exists contacts_owner_idx on public.contacts(owner_id);
create index if not exists conversations_assigned_to_idx on public.conversations(assigned_to);
create index if not exists conversations_contact_id_idx on public.conversations(contact_id);
create index if not exists conversations_team_id_idx on public.conversations(team_id);
create index if not exists crm_activities_contact_id_idx on public.crm_activities(contact_id);
create index if not exists crm_activities_conversation_id_idx on public.crm_activities(conversation_id);
create index if not exists crm_activities_created_by_idx on public.crm_activities(created_by);
create index if not exists crm_activities_opportunity_id_idx on public.crm_activities(opportunity_id);
create index if not exists crm_stages_org_idx on public.crm_stages(organization_id);
create index if not exists messages_org_idx on public.messages(organization_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists opportunities_contact_id_idx on public.opportunities(contact_id);
create index if not exists opportunities_created_by_idx on public.opportunities(created_by);
create index if not exists opportunities_owner_id_idx on public.opportunities(owner_id);
create index if not exists opportunities_pipeline_id_idx on public.opportunities(pipeline_id);
create index if not exists opportunities_stage_id_idx on public.opportunities(stage_id);
create index if not exists organization_memberships_user_id_idx on public.organization_memberships(user_id);
create index if not exists team_members_org_idx on public.team_members(organization_id);
create index if not exists team_members_user_id_idx on public.team_members(user_id);
