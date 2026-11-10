-- Anexos do Inbox: bucket privado "inbox-media" e regras de acesso por empresa.
-- Migração somente aditiva: 1 função auxiliar, 1 bucket e 2 regras em storage.objects.
--
-- Os arquivos ficam em <organization_id>/<conversation_id>/<uuid>-<nome>. Quem é da empresa
-- (qualquer papel) lê e envia na pasta dela. O servidor gera links temporários assinados
-- para a D-API baixar o arquivo; nada é público.

create or replace function private.inbox_media_org(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $fn$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
  end
$fn$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inbox-media',
  'inbox-media',
  false,
  16777216,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/x-m4a',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inbox_media_select on storage.objects;
create policy inbox_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'inbox-media' and private.has_org_role(private.inbox_media_org(name)));

drop policy if exists inbox_media_insert on storage.objects;
create policy inbox_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inbox-media' and private.has_org_role(private.inbox_media_org(name)));
