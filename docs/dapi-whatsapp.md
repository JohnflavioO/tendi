# D-API WhatsApp por QR Code

## Configuração do servidor

Cadastre `DAPI_API_KEY` como variável de ambiente/secret no projeto Vercel (Production, Preview e Development conforme necessário). A chave nunca é enviada ao navegador.

A integração usa a API REST em `https://api.d-api.cloud/api/v1` e cria sessões com `type: unofficial`, `provider: whatsmeow` e `connectionMode: qr`.

## Fluxo implementado

- O usuário autenticado solicita conexão dentro de um workspace.
- A API valida a associação ativa em `organization_memberships`.
- O servidor cria uma sessão D-API com identificador aleatório exclusivo.
- O identificador é salvo em `channel_connections.provider_account_id`, vinculado ao `organization_id`.
- QR Code, status e desconexão são consultados exclusivamente pelo servidor.
- O usuário não pode consultar ou desconectar sessões de outro workspace.

## Rotas internas

- `POST /api/whatsapp/connect?organizationId=...`
- `GET /api/whatsapp/qr?organizationId=...`
- `GET /api/whatsapp/status?organizationId=...`
- `POST /api/whatsapp/disconnect?organizationId=...`

## Limites desta etapa

A documentação pública consultada confirma criação de sessão, consulta de QR Code, leitura de dados da sessão e desconexão. Ela não especifica, nas páginas consultadas, o contrato completo dos eventos de webhook, autenticação do callback e payloads normalizados. Por isso, esta etapa não inventa um receptor de webhook nem marca mensagens como recebidas no Inbox. A ingestão de mensagens e a confirmação assíncrona de conexão devem ser concluídas após validar esses contratos com a D-API.

## Banco de dados

A implementação reutiliza `channel_connections` e seus campos existentes (`organization_id`, `channel`, `provider_account_id`, `settings` e `status`). Nenhuma migration é necessária para este fluxo e nenhuma migration foi executada.
