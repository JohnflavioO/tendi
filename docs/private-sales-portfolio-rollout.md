# Carteira privada — verificação antes de habilitar

Esta migração é **somente preparação**. A flag `sales_portfolio_settings.private_mode_enabled` continua desligada. Nenhuma organização é ativada.

## Requisitos de liberação

- [ ] Testes com dois vendedores e um supervisor, usando JWTs reais, cobrindo SELECT/INSERT/UPDATE e busca de contatos, conversas, mensagens, oportunidades e atividades
- [ ] Proteger INSERT de contatos/conversas/oportunidades e mudanças de `owner_id` / `assigned_to` contra apropriação de carteira
- [ ] Implementar transferência **transacional e auditada**, atualizando contato, conversas e oportunidades e exigindo gestor autenticado
- [ ] Revisar rotas de API que usam `service_role` e não respeitam RLS, inclusive envio e download de mídia
- [ ] Revisar políticas de Storage, URLs assinadas, Realtime e contagens/relatórios para não expor contatos de outros vendedores
- [ ] Definir o tratamento de atividades sem `contact_id` e oportunidades sem contato
- [ ] Criar configuração por empresa/setor e ativação controlada apenas após testes completos
- [ ] Confirmar que a modalidade compartilhada, o Inbox, CRM e os canais QR/Meta continuam iguais

## Reversão

Enquanto a flag estiver desligada, a aplicação mantém as políticas existentes.
Em caso de regressão, não habilitar a flag. Para reverter a migração, remover as políticas
`portfolio_*` antes de remover as funções `private.sales_portfolio_*`.

**Não aplicar esta migração manualmente em produção antes de CI e revisão de segurança.**
