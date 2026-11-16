# On Connect — integração inicial com Tendi

## Objetivo

O Tendi será o primeiro consumidor do On Connect. A integração é feita por contrato HTTP versionado e não deve acoplar telas ou regras de negócio do Tendi a um fornecedor específico de WhatsApp.

## Limites desta etapa

- O Tendi mantém organizações, usuários, contatos, conversas e mensagens.
- O On Connect será responsável por credenciais dos provedores, conexões WhatsApp, transporte de mensagens, normalização de eventos e webhooks.
- O Tendi nunca recebe nem armazena tokens privados da Meta.
- Segredos de integração ficam exclusivamente no servidor.
- A conexão inicial de produção será Meta Cloud API via Embedded Signup.
- Provedores parceiros só serão habilitados após validação técnica, contratual e de conformidade.

## Contrato compartilhado

Os schemas Zod em `packages/shared/src/on-connect.ts` definem os tipos de conexão, criação, envio de texto, resultados e eventos recebidos.

## Fluxo previsto

1. Usuário autorizado do Tendi inicia a conexão no painel.
2. Backend do Tendi cria uma conexão no On Connect em nome da organização.
3. On Connect inicia o fluxo oficial de autorização Meta e retorna a URL de autorização.
4. Meta conclui o Embedded Signup e On Connect confirma o estado da conexão.
5. On Connect notifica o Tendi por webhook assinado.
6. Tendi atualiza sua referência local de canal e habilita o envio.
7. Mensagens de entrada são entregues por webhook; mensagens de saída passam pelo endpoint de mensagens do On Connect.

## Regras de segurança

- Não colocar `ON_CONNECT_API_KEY` em variáveis `NEXT_PUBLIC_*`.
- Validar assinatura HMAC dos webhooks e rejeitar timestamps fora da janela permitida.
- Deduplicar eventos pelo identificador do evento.
- Usar idempotência no envio de mensagens.
- Autorizar cada operação com base na organização ativa resolvida no servidor.
- Não confiar em `organization_id` enviado pelo navegador.
- Não registrar tokens, chaves ou conteúdo sensível em logs.

## Próximas entregas

1. Serviço On Connect independente com API Fastify, worker e PostgreSQL próprio.
2. Autenticação serviço-a-serviço e mapeamento organização Tendi ↔ tenant On Connect.
3. Rotas de criação/listagem/status de conexões e envio de mensagens.
4. Webhook ingress com assinatura, deduplicação e retentativas.
5. Adapter no backend do Tendi e persistência da referência externa em migration aditiva.
6. Testes de integração e validação ponta a ponta no ambiente Preview.
