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
- Pagamento das assinaturas: ver a decisão de 2026-11-12 (Pagar.me).

## 2026-11-12 — Assinaturas pela Pagar.me

- A InfinitePay foi descartada: a API de checkout dela não faz cobrança recorrente nem integra os "Planos e Recorrência" (sem webhook), então o Tendi não saberia quem pagou.
- **Pagar.me (API v5)**: o Super Admin cola a chave secreta em Super Admin › Pagamentos (fica no Supabase Vault; `PAGARME_SECRET_KEY` vale como alternativa), publica o preço de cada plano (cria o plano mensal na Pagar.me) e cadastra o webhook com a URL exibida na tela.
- O cliente assina em `/assinatura`: o servidor cria um link de pagamento do tipo `subscription` (checkout hospedado pela Pagar.me, só cartão de crédito) com `customer.code` = id da empresa. O Tendi nunca recebe dados de cartão.
- Webhook (`/api/webhooks/pagarme/<segredo>`): sem assinatura digital na Pagar.me, então o segredo vai na URL e o estado verdadeiro é sempre buscado na API (`GET /subscriptions/{id}`). Eventos são idempotentes (`billing_events`).
- Regras: assinatura ativa libera a empresa no plano pago; cobrança recusada = "pagamento pendente" (acesso continua enquanto a Pagar.me tenta de novo); cancelada = empresa suspensa. Teste vencido ou empresa suspensa levam a `/assinatura`.
- Segurança: um gatilho no banco impede que usuários alterem `status`, `plan_code` e datas do teste da própria empresa; só o Super Admin e o servidor alteram.
- Troca de plano e cancelamento pelo cliente ficam com o suporte nesta etapa.
