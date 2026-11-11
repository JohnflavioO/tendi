# Decisões técnicas

## 2026-11-08 — Fase 0A

- Marca do produto: **Tendi**.
- O frontend será a única aplicação desta fase com deploy na Vercel.
- `NEXT_PUBLIC_DATA_MODE` controla a fonte de dados; o padrão é `mock`.
- O backend será Fastify (em vez de NestJS) pela menor sobrecarga e adequação a endpoints de webhook e fila; contratos compartilhados seguem em Zod.
- O realtime é consumido por interface, permitindo trocar o mock por Socket.IO futuramente.
- Não iniciar backend, worker, bancos, Redis, n8n, integração Meta ou IA nesta fase.
- Repositório informado como vazio foi encontrado público e com `main` não protegida. Manter a implementação em branch e registrar a necessidade de tornar privado e proteger `main` nas configurações do GitHub.

## 2026-11-11 — Resposta automática do agente de IA

- O Super Admin conecta a IA pelo painel (Super Admin > Agentes de IA): a chave de API é gravada criptografada no **Supabase Vault** por funções que só a chave de serviço executa. A variável de ambiente (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) continua valendo como alternativa.
- O webhook da D-API responde 200 na hora e agenda a resposta da IA com `waitUntil` (Vercel). A IA espera 4 s para juntar mensagens seguidas do cliente e responde uma vez só.
- Garantias: responde apenas à última mensagem da conversa; trava por mensagem (`conversations.ai_replied_to_message_id`) contra reentrega do webhook; limite de 40 respostas por conversa em 24 h; quando o atendente responde pelo Inbox a IA desliga (`ai_mode = 'off'`).
- Transferência: o marcador `[[TRANSFERIR_ATENDENTE]]` ou uma recusa do modelo levam a conversa para `ai_mode = 'handoff'`.
- Todo uso fica em `ai_usage_events` (tokens e resultado), base para limites por plano e cobrança.
- Pagamento das assinaturas: **InfinitePay** (próxima etapa).
