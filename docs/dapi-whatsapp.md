# D-API WhatsApp — Fase 1

## Arquitetura identificada

O deploy atual usa Next.js 14 App Router na Vercel. As rotas em `apps/web/app/api` executam no servidor e fazem a ponte entre o navegador, Supabase e D-API.

O repositório descreve Fastify/API VPS como arquitetura futura, mas não há implementação ativa em `apps/api` nesta branch. A Fase 1 usa, portanto, as rotas server-side existentes do Next.js, sem introduzir um novo serviço.

## Variáveis de ambiente

Configure no projeto Vercel, para Preview e Production:

- `DAPI_API_KEY`: chave de API da conta D-API (não usar Publishable Key).
- `DAPI_WEBHOOK_SECRET`: segredo aleatório forte, usado no path do webhook.

Ambas são lidas somente no servidor. Não use prefixo `NEXT_PUBLIC_` e não exponha seus valores ao navegador.

## Contrato D-API

- Base URL: `https://api.d-api.cloud/api/v1`.
- Autenticação: `Authorization: <DAPI_API_KEY>`, sem prefixo `Bearer`.
- Criação: `POST /sessions`.
- `sessionId` é estável por workspace e salvo em `channel_connections.provider_account_id` antes da chamada externa.
- O payload de criação segue a especificação fornecida: `connectionMode: "qr"`, `webhookUrl`, `webhookConfig` com `type: "single"` e os 18 eventos, além de `ignoreGroups`, `ignoreStatus` e `historySync`.

## Webhook de entrada

A URL é derivada do domínio da requisição que iniciou a sessão:

`https://<domínio-do-deploy>/api/webhooks/dapi/<DAPI_WEBHOOK_SECRET>`

O endpoint da Fase 1 valida o segredo e responde HTTP 200 imediatamente para callbacks válidos. A validação e persistência dos eventos, idempotência, filas e atualização do estado da sessão pertencem à Fase 3.

## Persistência e isolamento

A implementação reutiliza `channel_connections` e valida a associação ativa do usuário em `organization_memberships`. Não foi criada tabela nova e nenhuma migration foi executada.

## Limites desta fase

A Fase 1 provisiona a sessão e configura o callback. Ela não implementa a leitura/polling do QR Code, processamento de eventos, recebimento no Inbox ou envio de mensagens. Esses itens permanecem nas Fases 2 a 5 e devem ser testados separadamente.
