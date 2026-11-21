-- Profile pictures and company logos. Public images, no sensitive data.
alter table public.organizations add column if not exists logo_url text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',true,1048576,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy profile_avatars_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_avatars_update on storage.objects for update to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_avatars_delete on storage.objects for delete to authenticated
using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
