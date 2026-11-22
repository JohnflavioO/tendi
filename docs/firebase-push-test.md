# Envio de push de teste — configuração de produção

Esta etapa usa a API FCM HTTP v1 no servidor. **Nenhuma credencial privada deve ser enviada ao ChatGPT ou colocada no GitHub.**

## Vercel
1. No Firebase Console do projeto `tendidesk`, abra **Configurações do projeto > Contas de serviço**.
2. Gere uma chave privada JSON para uma conta de serviço com permissões adequadas ao Firebase Cloud Messaging. Trate o arquivo como segredo.
3. No Vercel, abra **Project Settings > Environment Variables** e crie `FIREBASE_SERVICE_ACCOUNT_JSON` com o conteúdo JSON completo. Defina apenas nos ambientes necessários; **não** use prefixo `NEXT_PUBLIC_`.
4. Faça um novo deploy depois de salvar a variável. Nunca registre a variável em logs.
5. Verifique se a API Firebase Cloud Messaging está habilitada no projeto.

## Teste no iPhone
- iOS 16.4+; abrir o TendiDesk via **ícone instalado na Tela de Início**, não numa aba comum do Safari.
- No sininho, tocar **Ativar notificações** e permitir; o dispositivo será registrado para a empresa ativa.
- Tocar **Enviar push de teste** e fechar o TendiDesk. Conferir a notificação do sistema.
- O botão aparece depois de registrar o dispositivo; se a página recarregar, será preciso ativar novamente antes do teste.

## Limitações
- A API envia para o dispositivo ativo mais recentemente visto da empresa e usuário autenticado.
- O registro do teste no histórico não significa entrega confirmada no iPhone.
- Há limite de uma solicitação de teste por minuto por usuário e empresa.
- Revogação de token no logout/troca de conta e tratamento de tokens expirados são trabalhos pendentes. Até implementá-los e validá-los, **não usar dados sensíveis no corpo do push**.
- A implementação usa dados genéricos e rota interna `/agenda`.
- A integração dos lembretes recorrentes será uma etapa posterior.
