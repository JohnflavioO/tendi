-- Uma conversa aberta por contato e canal.
-- Dois eventos do WhatsApp chegando juntos (ex.: mensagem do cliente + resposta automática do
-- WhatsApp Business) criavam duas conversas para o mesmo contato. Esta migração junta as duplicadas
-- existentes e passa a recusar a segunda no banco; o webhook reaproveita a conversa que já existe.

-- 1) Junta duplicadas: fica a conversa com mais mensagens (empate: a mais recente).
with ranked as (
  select
    c.id,
    first_value(c.id) over (
      partition by c.organization_id, c.contact_id, c.channel
      order by (select count(*) from public.messages m where m.conversation_id = c.id) desc,
               c.last_message_at desc nulls last,
               c.created_at
    ) as keeper_id
  from public.conversations c
  where c.status <> 'closed'
),
dups as (select id, keeper_id from ranked where id <> keeper_id)
, moved_messages as (update public.messages m set conversation_id = d.keeper_id from dups d where m.conversation_id = d.id returning 1)
, moved_activities as (update public.crm_activities a set conversation_id = d.keeper_id from dups d where a.conversation_id = d.id returning 1)
, moved_sessions as (update public.webchat_sessions s set conversation_id = d.keeper_id from dups d where s.conversation_id = d.id returning 1)
, moved_usage as (update public.ai_usage_events u set conversation_id = d.keeper_id from dups d where u.conversation_id = d.id returning 1)
, moved_appointments as (update public.appointments p set conversation_id = d.keeper_id from dups d where p.conversation_id = d.id returning 1)
select
  (select count(*) from dups) as conversas_duplicadas,
  (select count(*) from moved_messages) as mensagens_movidas;

-- Conversa principal: soma os não lidos e fica com a última atividade.
update public.conversations k
set unread_count = agg.unread,
    last_message_at = agg.last_at
from (
  select keeper.id,
         sum(c.unread_count) as unread,
         max(c.last_message_at) as last_at
  from public.conversations keeper
  join public.conversations c
    on c.organization_id = keeper.organization_id
   and c.contact_id = keeper.contact_id
   and c.channel = keeper.channel
   and c.status <> 'closed'
  where keeper.status <> 'closed'
  group by keeper.id
  having count(*) > 1
) agg
where k.id = agg.id
  and exists (select 1 from public.messages m where m.conversation_id = k.id);

-- Remove as duplicadas (tudo já foi movido para a principal). Mesma escolha da principal do passo 1:
-- sempre sobra uma conversa por contato e canal, mesmo que todas estejam vazias.
delete from public.conversations c
using (
  select x.id,
         first_value(x.id) over (
           partition by x.organization_id, x.contact_id, x.channel
           order by (select count(*) from public.messages m where m.conversation_id = x.id) desc,
                    x.last_message_at desc nulls last,
                    x.created_at
         ) as keeper_id
  from public.conversations x
  where x.status <> 'closed'
) r
where c.id = r.id
  and r.id <> r.keeper_id
  and not exists (select 1 from public.messages m where m.conversation_id = c.id);

-- 2) Regra: no máximo uma conversa não encerrada por contato e canal.
create unique index if not exists conversations_one_open_per_contact_idx
  on public.conversations (organization_id, contact_id, channel)
  where status <> 'closed';
