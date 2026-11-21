# Firebase Cloud Messaging — configuração do TendiDesk

## Configuração recebida
O projeto Firebase `tendidesk` possui aplicativo Web registrado. Os identificadores públicos e a chave **pública** VAPID estão em `apps/web/lib/firebase-public-config.ts`.

**Atenção:** registrar a configuração não ativa notificações sozinho. Não adicionar `getAnalytics` para a função de push: o Analytics é opcional e deve respeitar consentimento aplicável.

## Próxima entrega técnica
1. Adicionar o SDK Firebase Messaging ao workspace `@tendi/web` com o lockfile do gerenciador de pacotes atualizado.
2. Usar o service worker existente `/sw.js` para obter o token FCM (sem registrar um segundo worker conflitante).
3. Pedir permissão somente após clique explícito em **Ativar notificações**, no aplicativo instalado no iPhone.
4. Criar API autenticada para registrar/revogar o token em `public.push_devices`, conferindo usuário, organização e status ativo no servidor.
5. Configurar envio FCM HTTP v1 **exclusivamente no servidor**, com credenciais de conta de serviço em secrets do ambiente de deploy, nunca no GitHub.
6. Enviar notificação de teste ao próprio usuário, validando entrega com o TendiDesk fechado.
7. Implementar lembretes recorrentes e agendador no Supabase.

## Teste no iPhone
iOS 16.4+; Safari → Compartilhar → Adicionar à Tela de Início → abrir o TendiDesk instalado → tocar em Ativar notificações → permitir. O push depende de rede e preferências do sistema.

## Observação de segurança
A chave VAPID pública e a configuração do aplicativo Web **não** permitem enviar notificações administrativas. Não compartilhar a chave privada VAPID, JSON de conta de serviço ou outros segredos.
