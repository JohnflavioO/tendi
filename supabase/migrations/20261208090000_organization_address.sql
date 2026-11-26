-- Endereço da empresa: hoje só usado na tela pública de agendamento (mostrar pro cliente
-- + link "Ver no mapa"), mas fica em organizations por ser dado da empresa, não da agenda.
alter table public.organizations add column if not exists address text check (address is null or char_length(address) <= 200);
