# Notificações do TendiDesk — arquitetura e implantação

## Estado verificado (2026-11-21)
- Frontend Next.js 14 / React 18 em `apps/web`, com Supabase.
- PWA já possui `apps/web/app/manifest.ts`, `apps/web/components/pwa-register.tsx` e `apps/web/public/sw.js`.
- O service worker existente faz cache apenas de recursos estáticos, oferece página offline e evita cache de APIs e autenticação.
- A inspeção inicial das tabelas `public` não mostrou uma tabela dedicada a notificações.
- O README da raiz descreve uma fase antiga; conferir código e migrations antes de alterações.

## Decisão
Manter o service worker existente e construir notificações internas no Supabase, com Firebase Cloud Messaging (FCM) para push web e Resend para e-mails. Não introduzir Novu nesta fase.

## Modelo proposto (não aplicado)
- `notifications`: id, organization_id, recipient_user_id, event_type, title, body, target_path, created_at, read_at, deduplication_key.
- `push_subscriptions` ou `push_devices`: id, organization_id, user_id, device identifier, token/endpoint, platform, enabled, created_at, updated_at, last_seen_at.
- `notification_preferences`: organization_id, user_id, event_type, in_app_enabled, push_enabled, email_enabled.
- Índices por destinatário e data, e chave de idempotência por evento/destinatário.
- RLS: usuário só consulta/altera suas próprias notificações; nenhuma escrita de notificações pelo cliente sem validação no servidor; associação à organização verificada por membership vigente.
- Definir regras de retenção, revogação de tokens, bloqueio de usuário e logout antes de criar tabelas.

## Fluxo
1. Evento de negócio validado no backend (nova mensagem, atribuição, transferência, lead, tarefa).
2. Resolver destinatários autorizados na organização e deduplicar.
3. Persistir notificação interna no banco e disponibilizar atualização em tempo real.
4. Entregar push via função/backend com credenciais Firebase somente no servidor.
5. Clique no push abre URL interna segura do TendiDesk, após autenticação e autorização.
6. Resend é canal opcional para eventos relevantes, respeitando preferências.

## Cuidados com PWA e FCM
- Reutilizar `/sw.js`; não registrar um segundo worker conflitante no mesmo escopo.
- Revisar integração do SDK FCM no worker antes de implementar o listener `push`, evitando notificações duplicadas.
- Pedir permissão de notificação somente por ação explícita do usuário.
- Android e desktop: testar navegadores suportados em HTTPS.
- iOS: testar PWA adicionado à tela inicial, com permissão solicitada em gesto do usuário; verificar compatibilidade do fluxo FCM escolhido.
- Não enviar conteúdo sensível de conversas no corpo de push por padrão.
- Evitar cache de mensagens, sessões e dados de clientes no service worker.

## Etapas de entrega
1. Auditoria do fluxo de autenticação, memberships, componentes de navegação e migrations existentes.
2. Migration revisada com RLS e testes de isolamento multi-tenant; aplicar em ambiente de teste antes de produção.
3. Sininho e Inbox de notificações com leitura, contador e preferências.
4. Configurar projeto Firebase e credenciais, registrar dispositivos e integrar envio FCM.
5. Integrar eventos de negócio, deduplicação, rate limiting e testes.
6. Validar instalação e push em Windows, Android e iOS; revisar acessibilidade e logs.

## Critérios de aceite
- Um usuário da organização A nunca visualiza notificações ou tokens da organização B.
- Usuário bloqueado/desvinculado deixa de receber novos pushes.
- Logout revoga ou desvincula o dispositivo conforme política.
- Clique em notificação não permite redirecionamento externo arbitrário.
- Sem permissão de push, o sininho interno continua funcionando.
- Sem conexão, nenhuma mensagem privada é exposta via cache.
- Build, lint, typecheck e testes passam antes do merge.

Este documento é apenas planejamento: não cria tabelas, credenciais, workers ou notificações em produção.
