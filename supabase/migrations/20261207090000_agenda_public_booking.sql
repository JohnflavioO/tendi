-- Agendamento público: cliente final marca horário sozinho por um link, sem entrar no painel.
-- Nada aqui dá acesso direto a `anon` — a tela pública fala só com rotas de API que usam a
-- service role, validam tudo (empresa ativa, agendamento público ligado, horário livre) e
-- reaproveitam as mesmas funções de fuso horário e vagas livres que a Agenda interna já usa
-- (apps/web/lib/agenda.ts). O liga/desliga e as regras (janela de dias, antecedência mínima)
-- ficam em organizations.agenda_settings->publicBooking, no mesmo padrão já usado por
-- agenda_settings->reminders.
--
-- Exemplo de valor:
--   { "publicBooking": { "enabled": true, "windowDays": 14, "minNoticeMinutes": 60 } }

-- Limite de tentativas por telefone: a rota de criação conta quantos agendamentos com
-- `source = 'customer'` aquele telefone fez recentemente, nesta empresa, para barrar abuso.
create index if not exists appointments_public_booking_phone_idx
  on public.appointments(organization_id, customer_phone, created_at)
  where source = 'customer';
