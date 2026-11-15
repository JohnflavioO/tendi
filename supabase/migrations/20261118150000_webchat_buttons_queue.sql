-- Webchat: configuração dos botões (falar com atendente, encerrar, respostas rápidas) e fila de atendimento.

-- 1) Configuração do chat do site. Vazio = padrões do app (lib/webchat-config.ts).
alter table public.webchat_widgets
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2) Quando a conversa entrou na fila (pediu um atendente). Define a posição na fila.
alter table public.conversations
  add column if not exists handoff_at timestamptz;

-- Conversas que já estão aguardando atendente entram na fila pela última atividade.
update public.conversations
set handoff_at = coalesce(last_message_at, created_at)
where ai_mode = 'handoff' and handoff_at is null;

-- Marca a entrada na fila em qualquer caminho (IA, botão do visitante, Inbox, lembretes da agenda).
create or replace function private.set_conversation_handoff_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai_mode = 'handoff' and (tg_op = 'INSERT' or old.ai_mode is distinct from 'handoff') then
    new.handoff_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_handoff_at on public.conversations;
create trigger conversations_handoff_at
  before insert or update of ai_mode on public.conversations
  for each row execute function private.set_conversation_handoff_at();

-- Consulta da posição: conversas aguardando atendente, sem responsável, por empresa.
create index if not exists conversations_queue_idx
  on public.conversations (organization_id, handoff_at)
  where ai_mode = 'handoff' and assigned_to is null and status <> 'closed';
