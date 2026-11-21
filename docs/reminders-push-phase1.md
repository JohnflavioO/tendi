# TendiDesk — Push para lembretes (fase 1)

## Objetivo
Lembretes devem chegar como **notificações do sistema operacional**, mesmo com o TendiDesk fechado. O sininho do app é um histórico adicional, não substitui push.

## Estado desta entrega
- `/sw.js` já é o service worker da PWA; agora recebe eventos `push` e `notificationclick`.
- Exibe título/corpo com limites de tamanho, ícone do TendiDesk e abre somente rotas internas.
- **Esta entrega não envia push real.** Não registra token FCM nem pede permissão prematuramente.
- A migration `push_devices` já foi aplicada no Supabase; seu acesso direto por cliente está bloqueado por design.

## Próximos passos obrigatórios
1. Criar projeto Firebase para TendiDesk e habilitar Cloud Messaging/Web Push; gerar a chave VAPID pública.
2. Configurar credenciais públicas no deploy (Firebase web app config, VAPID pública) e credenciais administrativas **somente no servidor** (conta de serviço / mecanismo de autenticação Firebase). Nunca usar `NEXT_PUBLIC_` para segredo.
3. Implementar registro de dispositivo com sessão Supabase verificada e vínculo ativo na empresa; validar a permissão do navegador, obter token FCM, registrar e revogar em `push_devices` via endpoint servidor. Tratar rotação de token, logout e bloqueio de usuário.
4. Criar endpoint interno de teste protegido para **enviar push real ao próprio usuário**. Não permitir que clientes informem livremente o destinatário.
5. Criar `reminders` com dono, empresa, horário/fuso, recorrência e agendador idempotente. Notificação deve ser gravada em `notifications` e enviada aos dispositivos autorizados. Processar horário no servidor e evitar duplicação.
6. Testar entrega com aplicativo fechado em desktop, Android e iPhone.

## iPhone
- Requer iOS 16.4+; abrir TendiDesk no Safari e usar **Compartilhar > Adicionar à Tela de Início**.
- Abrir o aplicativo instalado, tocar em **Ativar notificações** (a futura tela deve pedir permissão somente após interação do usuário).
- A autorização de notificações e o envio de um push de teste devem ser confirmados no próprio aparelho.
- O iOS pode atrasar ou suprimir notificações conforme rede, foco e preferências do sistema. Não prometer entrega em minuto exato.

## Segurança e privacidade
- Não incluir valores de cobranças ou dados sensíveis na notificação por padrão; usar texto genérico e abrir detalhes após autenticação.
- Notificações só podem ser criadas para usuários ativos da organização correspondente.
- Não cachear payloads de notificação. Não usar URLs externas em `notificationclick`.
- Para futuro envio ao cliente via WhatsApp, exigir opt-in e seguir as regras de templates e janela de atendimento.
