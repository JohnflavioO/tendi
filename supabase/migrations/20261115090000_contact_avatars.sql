-- Foto de perfil do WhatsApp dos contatos (somente aditiva).
-- avatar_url guarda o link devolvido pela D-API; avatar_checked_at evita consultar de novo a cada abertura
-- (o link é renovado depois de alguns dias, porque os links do WhatsApp expiram).
alter table public.contacts
  add column if not exists avatar_url text check (avatar_url is null or avatar_url ~ '^https?://'),
  add column if not exists avatar_checked_at timestamptz;
