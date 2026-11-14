# Instagram e Messenger (Meta)

Como ativar os canais de Instagram e Messenger no Tendi. Depende de um app próprio da Tendi
cadastrado no Meta for Developers.

Os dois entram pelo **mesmo Login do Facebook para Empresas** (a Meta aposentou o login próprio
do Instagram — "API setup with Instagram login" — para apps criados recentemente; eles só têm a
"API setup with Unified login"). A diferença é que o Instagram usa uma **Configuração de login**
própria (identificada por um `config_id`), que já embute os ativos (Página + conta do Instagram)
e as permissões, em vez de pedir permissões soltas como o Messenger.

## 1. Criar o app na Meta

1. Entre em [developers.facebook.com](https://developers.facebook.com/) com a conta que
   administra a página do Facebook e a conta do Instagram que vão testar.
2. **Meus apps → Criar app → tipo "Negócios"**. Dê um nome (ex.: "Tendi").
3. Em **Casos de uso**, adicione **"Interagir com os clientes no Messenger from Meta"** e
   **"Gerenciar mensagens e conteúdo no Instagram"**.
4. Em **Configurações do app → Básico**, anote o **ID do app** e a **Chave secreta do app** —
   os dois produtos usam essas mesmas credenciais.

## 2. Login do Facebook para Empresas (Messenger)

Em **Login do Facebook para Empresas → Configurações**:

- **URIs de redirecionamento OAuth válidos**: `https://SEU-APP/api/meta/oauth/callback`

## 2.1. Configuração de login do Instagram (Unified login)

Vá em **Instagram → API setup with Unified login** → seção **"1. Configure seu app"** → clique em
**"Criar nova configuração"**:

- Em **Ativos de negócios**, escolha a **Página do Facebook** conectada à conta profissional do
  Instagram, e a própria **Conta do Instagram** (obrigatória).
- Em **Permissões**, mantenha pelo menos `instagram_basic` e `instagram_manage_messages` (é o que
  o Tendi usa para receber mensagens); pode desmarcar `ads_management`, `ads_read`,
  `instagram_content_publish` e `instagram_manage_comments` se não forem necessárias.
- Salve e anote o **ID da configuração** (um número) — é o `META_INSTAGRAM_CONFIG_ID` abaixo.
- **URL de redirecionamento**: registre `https://SEU-APP/api/meta/instagram/oauth/callback`.

## 3. Webhook

Repita em cada um dos dois casos de uso (Messenger e Instagram), na aba **Webhooks**:

- **URL de callback**: `https://SEU-APP/api/webhooks/meta`
- **Token de verificação**: invente uma frase (ela vai para a variável `META_WEBHOOK_VERIFY_TOKEN`
  abaixo; não precisa ser complexa, só não pode ficar em branco nem ser o *nome* da variável).
- **Campos inscritos**: pelo menos `messages`.

## 4. Variáveis de ambiente do servidor

| Variável | Valor |
| --- | --- |
| `META_APP_ID` | ID do app, do topo do painel (passo 1) — usado pelo Messenger **e** pelo Instagram |
| `META_APP_SECRET` | Chave secreta do app, do topo do painel (passo 1) — usado pelo Messenger **e** pelo Instagram |
| `META_INSTAGRAM_CONFIG_ID` | ID da Configuração de login do Instagram (passo 2.1) |
| `META_WEBHOOK_VERIFY_TOKEN` | O token de verificação que você inventou no passo 3 (os dois produtos usam o mesmo) |

Sem as credenciais de um produto, a tela de Conexões mostra que aquele botão ainda não foi
configurado (os dois são independentes: dá para ativar o Messenger antes do Instagram, ou
vice-versa — o Instagram só precisa, além do `META_APP_ID`/`META_APP_SECRET` já configurados para
o Messenger, do `META_INSTAGRAM_CONFIG_ID`). Depois de criar ou alterar uma variável, é preciso um
**novo deploy** para ela valer — salvar na Vercel não é suficiente.

## 5. Revisão do app (App Review)

Enquanto o app estiver em modo de desenvolvimento ("Não publicado"), só contas cadastradas em
**Funções do app** conseguem conectar. Para qualquer cliente conectar, é preciso pedir à Meta a
revisão das permissões usadas nas configurações acima (`pages_show_list`, `pages_messaging`,
`pages_manage_metadata` para o Messenger; `instagram_basic`, `instagram_manage_messages` para o
Instagram). A revisão pede um vídeo mostrando o uso de cada permissão e pode levar alguns dias.

## Como funciona depois de configurado

**Messenger:** o dono/administrador clica em "Conectar com Facebook", faz login, autoriza o
Tendi a ver suas páginas e escolhe uma. O token da página fica guardado no Vault do banco.

**Instagram:** o dono/administrador clica em "Conectar Instagram" e faz login pela mesma tela do
Facebook, autorizando a Configuração de login cadastrada. Como ela já fixa a Página e a conta do
Instagram, não há etapa de escolha: a conexão usa direto a conta vinculada, e o token guardado no
Vault é o da Página (é ele que autoriza enviar mensagens pela conta do Instagram).

Depois de conectado, as mensagens recebidas em qualquer um dos dois passam a aparecer na Inbox
do Tendi.

## O que ainda não existe

- **Responder pelo Inbox**: por enquanto, só a recepção está pronta. Enviar uma resposta de
  dentro do Tendi para o Instagram/Messenger ainda não foi implementado; responda direto pelo
  Instagram/Messenger enquanto isso.
- **Resposta automática da IA**: liberada só para WhatsApp e Webchat nesta etapa.
- **Nome do contato**: como o webhook não traz o nome de quem escreve, o contato chega como
  "Contato do Instagram/Messenger" — edite o nome manualmente em Contatos.
- **Este fluxo não foi testado por nós contra a API real da Meta** antes de vocês tentarem — ele
  segue o que o próprio painel da Meta mostrou durante a configuração, mas a Meta muda esses
  detalhes com frequência. Se algo não bater com o que a tela da Meta pedir, me avise com a
  mensagem de erro exata.
