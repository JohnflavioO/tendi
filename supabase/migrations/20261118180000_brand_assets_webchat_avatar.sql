-- Imagem do chat do site (avatar ou logo da empresa).
-- Bucket público "brand-assets": imagens de marca que aparecem em sites de clientes (leitura pública).
-- Caminho: <organization_id>/<arquivo>. Só dono, admin ou supervisor da empresa enviam, trocam ou apagam.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Reaproveita private.inbox_media_org(name): devolve a empresa da primeira pasta do caminho (ou null).
drop policy if exists brand_assets_insert on storage.objects;
create policy brand_assets_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.has_org_role(private.inbox_media_org(name), array['owner', 'admin', 'manager']));

drop policy if exists brand_assets_update on storage.objects;
create policy brand_assets_update on storage.objects
  for update to authenticated
  using (bucket_id = 'brand-assets' and private.has_org_role(private.inbox_media_org(name), array['owner', 'admin', 'manager']))
  with check (bucket_id = 'brand-assets' and private.has_org_role(private.inbox_media_org(name), array['owner', 'admin', 'manager']));

drop policy if exists brand_assets_delete on storage.objects;
create policy brand_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand-assets' and private.has_org_role(private.inbox_media_org(name), array['owner', 'admin', 'manager']));

-- Endereço público da imagem usada no cabeçalho e no convite do chat.
alter table public.webchat_widgets
  add column if not exists avatar_url text;

comment on column public.webchat_widgets.avatar_url is
  'Imagem (logo ou avatar) do chat do site, no bucket público brand-assets. Null = iniciais do nome.';
