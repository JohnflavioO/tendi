# D-API WhatsApp — Fase 1

## Arquitetura identificada

O deploy atual usa Next.js 14 App Router na Vercel. As rotas em `apps/web/app/api` executam no servidor e fazem a ponte entre o navegador, Supabase e D-API.

O repositório descreve Fastify/API VPS como arquitetura futura, mas não há implementação ativa em `apps/api` nesta branch. A Fase 1 usa, portanto, as rotas server-side existentes do Next.js, sem introduzir um novo serviço.

## Variáveis de ambiente

Configure no projeto Vercel, para Preview e Production:

- `DAPI_API_KEY`: chave de API da conta D-API (não usar Publishable Key).
- `DAPI_WEBHOOK_SECRET`: segredo aleatório forte, usado no path do webhook.
- `DAPI_WEBHOOK_BASE_URL`: domínio HTTPS público do Tendi que recebe os callbacks,
  sem o caminho do webhook (por exemplo, `https://tendidesk.com.br`).
- `DAPI_BASE_URL` (opcional): base HTTPS da API do provedor. Quando ausente,
  mantém `https://api.d-api.cloud/api/v1`. Pode apontar para um provedor compatível;
  uma configuração vazia ou inválida gera erro, sem trocar silenciosamente de provedor.

Ambas são lidas somente no servidor. Não use prefixo `NEXT_PUBLIC_` e não exponha seus valores ao navegador.

## Contrato D-API

- Base URL: `https://api.d-api.cloud/api/v1`.
- Autenticação: `Authorization: <DAPI_API_KEY>`, sem prefixo `Bearer`.
- Criação: `POST /sessions`.
- `sessionId` é estável por workspace e salvo em `channel_connections.provider_account_id` antes da chamada externa.
- O payload de criação segue a especificação fornecida: `connectionMode: "qr"`, `webhookUrl`, `webhookConfig` com `type: "single"` e os 18 eventos, além de `ignoreGroups`, `ignoreStatus` e `historySync`.

## Webhook de entrada

A URL usa explicitamente `DAPI_WEBHOOK_BASE_URL` (não o domínio da requisição):

`https://<domínio-do-deploy>/api/webhooks/dapi/<DAPI_WEBHOOK_SECRET>`

O segredo é codificado para uso em URL. Não copie a URL completa em logs,
capturas de tela ou chamados.

O endpoint da Fase 1 valida o segredo e responde HTTP 200 imediatamente para callbacks válidos. A validação e persistência dos eventos, idempotência, filas e atualização do estado da sessão pertencem à Fase 3.

## Persistência e isolamento

A implementação reutiliza `channel_connections` e valida a associação ativa do usuário em `organization_memberships`. Não foi criada tabela nova e nenhuma migration foi executada.

## Limites desta fase

A Fase 1 provisiona a sessão e configura o callback. Ela não implementa a leitura/polling do QR Code, processamento de eventos, recebimento no Inbox ou envio de mensagens. Esses itens permanecem nas Fases 2 a 5 e devem ser testados separadamente.

## Usar On Connect pela API compatível

As telas do workspace usam textos neutros de WhatsApp. O console Super Admin
consulta o provedor configurado no servidor e indica **On Connect** quando a
base é `onconnect.tendidesk.com.br`, **D-API Cloud** no provedor padrão, ou um
rótulo genérico para outra base compatível. O estado da credencial significa
somente que a chave está preenchida; não é um teste de autenticação ou saúde.
Essa consulta exige acesso de Super Admin e retorna apenas nome, link conhecido
do provedor e presença da chave. Variáveis `DAPI_*`, rotas e identificadores
internos de compatibilidade permanecem iguais; nenhum segredo vai ao navegador.

O receptor atual já trata `messages.received`, `connection.status`,
`message.delivered` e `message.read`. O identificador salvo em
`channel_connections.provider_account_id` deve ser o mesmo `sessionId` enviado
pelo On Connect. O nome interno do provider continua `d-api` por compatibilidade
com os registros existentes; esta mudança não altera tabelas nem dados.

Para homologação isolada, use um deploy na Vercel com banco e workspace de
testes separados. Um Preview com as mesmas credenciais do Supabase de
Production continua acessando dados reais e não oferece esse isolamento.
Também é possível fazer um piloto na operação própria, em uma janela
combinada, quando ela for a única conexão que usa a D-API. Esse piloto troca
o provedor dessa conexão real e exige plano de retorno; não é um teste isolado.

| Variável do servidor | Configuração |
| --- | --- |
| `DAPI_BASE_URL` | `https://onconnect.tendidesk.com.br/compat/dapi/api/v1` |
| `DAPI_API_KEY` | Chave do cliente `tendi` no On Connect, salva como segredo na Vercel |
| `DAPI_WEBHOOK_BASE_URL` | Domínio público do deploy do Tendi que processará os eventos |
| `DAPI_WEBHOOK_SECRET` | Segredo forte gerado e armazenado fora do chat; substituir qualquer segredo exposto |

Não use `NEXT_PUBLIC_` nessas variáveis. As variáveis do provedor valem para
todo o deploy: trocar a base/chave em Production troca o destino das chamadas
de todos os workspaces que usam esse cliente. Confira esse alcance antes de
qualquer troca; se houver outras conexões ativas, use homologação separada ou
prepare seleção de provedor por workspace antes de migrar gradualmente.

Após configurar, redeploy do Tendi é necessário. Pelo workspace de testes,
inicie a conexão WhatsApp: o fluxo persiste o id estável `tendi-<organizationId>`,
cria a sessão no On Connect e informa o callback no formato D-API. Pareie um
número de testes por QR. Sessões existentes na D-API não são transferidas;
uma conexão nativa `teste` no On Connect também não vira automaticamente a
sessão compatível esperada pelo workspace. Não desconecte números ativos para
executar o teste.

### Piloto com a única conexão da própria Tendi

O usuário informou que os clientes reais ainda não usam números conectados
pela D-API; somente a própria Tendi tem uma conexão. Também confirmou que esse
número é diferente do número nativo `teste` já conectado ao On Connect; portanto,
essa conexão de teste pode permanecer como está durante a criação da nova sessão
compatível. Antes da migração:

1. Confirmar o número e o `provider_account_id` dessa conexão, sem alterar o
   identificador salvo no Tendi. O On Connect deve criar a sessão com esse id.
2. Guardar base/chave antigas em gerenciador seguro e combinar a janela de
   troca. Não apagar o workspace, as conversas ou a sessão antiga da D-API.
3. Se o mesmo número já estiver na conexão nativa `teste` do On Connect,
   planejar a liberação dessa conexão na janela e o pareamento da sessão
   compatível pelo Tendi. Não iniciar duas sessões do On Connect para o mesmo
   número nem desvincular a conexão ativa antes de concluir essa preparação.
4. Substituir o segredo de callback exposto e conferir o domínio público do
   receptor. A atualização da configuração não deve imprimir segredos.
5. Depois de aprovar a troca, configurar as variáveis, fazer redeploy, conectar
   a sessão pelo Tendi e executar a validação abaixo. Caso falhe, restaurar a
   configuração anterior, confirmar/reparear a sessão antiga quando necessário
   e atualizar seu webhook com o segredo vigente. Retorno pode exigir novo QR.

Valide, nesta ordem:

1. Mesmo `sessionId` no workspace do Tendi e na sessão do On Connect.
2. Endpoint listado no On Connect com formato `dapi` e destino no deploy correto.
3. Mensagem recebida no Inbox do workspace correto e resposta entregue no celular.
4. Mídia recebida/aberta e envio de mídia; confirmação de entrega/leitura quando disponível.
5. Repetição de um callback sem mensagem duplicada e rejeição de segredo inválido.

HTTP 200 não basta para homologar: o receptor responde 200 também para sessão
desconhecida ou remetente sem telefone. Confira `handled`, `reason` e a
persistência efetiva no Inbox. O worker considera 2xx uma entrega concluída.

Para voltar à D-API, restaure a base/chave anteriores no mesmo ambiente e faça
redeploy. Confira a sessão antiga e atualize seu callback para o domínio e o
segredo vigentes; não restaure um segredo que foi exposto. Preserve as
credenciais anteriores em um gerenciador seguro, sem removê-las durante o teste.

## Número oficial (API da Meta) pelo On Connect

Um workspace pode usar um número da API oficial da Meta no lugar do QR Code. O
número é ligado pela equipe TendiDesk; o cliente não lê QR.

1. Console › empresa › **Conexões › Número oficial (API da Meta)**: **Reservar
   sessão** quando o workspace ainda não tem WhatsApp (cria a conexão com o código
   estável `tendi-<organizationId>`), e **Copiar código**.
2. No painel do On Connect, **Conexões › Nova conexão Meta › Workspace do Tendi**,
   com esse código, o `phone_number_id` e o WABA. Se o workspace usa QR Code, marcar
   **Substituir a conexão atual**.
3. O On Connect informa `connectionType: "official"` nas consultas de sessão e de QR.
   O TendiDesk grava `settings.session_type = 'official'` (e `connection_mode =
   'meta'`), sem perder as outras configurações, e a tela de canais mostra o selo
   **API oficial da Meta**, sem QR Code nem botão de conectar/desconectar.

Na API oficial, texto livre só vai até 24 h depois da última mensagem do cliente;
fora disso a Meta recusa e o envio volta com erro (`meta_131047`). Modelos
aprovados (templates) ficam para a próxima fase.
