# Instagram e Messenger (Meta)

Como ativar os canais de Instagram e Messenger no Tendi. Depende de um app próprio da Tendi
cadastrado no Meta for Developers.

A Meta trata os dois como **produtos separados, com login separado**: o Messenger entra pela
página do Facebook; o Instagram entra direto pela conta do Instagram, sem página nenhuma. Por
isso a tela de Conexões tem dois botões — "Conectar com Facebook" e "Conectar Instagram" — e não
um só.

## 1. Criar o app na Meta

1. Entre em [developers.facebook.com](https://developers.facebook.com/) com a conta que
   administra a página do Facebook e a conta do Instagram que vão testar.
2. **Meus apps → Criar app → tipo "Negócios"**. Dê um nome (ex.: "Tendi").
3. Em **Casos de uso**, adicione **"Interagir com os clientes no Messenger from Meta"** e
   **"Gerenciar mensagens e conteúdo no Instagram"**.
4. Em **Configurações do app → Básico**, anote o **ID do app** e a **Chave secreta do app**.

## 2. Login do Facebook (só para o Messenger)

Em **Login do Facebook para Empresas → Configurações**:

- **URIs de redirecionamento OAuth válidos**: `https://SEU-APP/api/meta/oauth/callback`

## 2.1. Login do Instagram (credenciais próprias!)

O Instagram **não usa o ID/chave do topo do painel** nem a tela de Login do Facebook — ele tem
login e credenciais próprios. Usar o ID errado dá o erro "Invalid platform app".

Vá em **Instagram → API setup with Instagram login** (ou "Configuração da API com login do
Instagram") → seção **Business login settings** (ou "Configurações de login comercial"). Lá tem:

- **Instagram App ID** e **Instagram App Secret** — diferentes do ID/chave do app. Anote os dois.
- **Redirecionamentos OAuth / Callback URLs**: adicione `https://SEU-APP/api/meta/instagram/oauth/callback`.

## 3. Webhook

Repita em cada um dos dois casos de uso (Messenger e Instagram), na aba **Webhooks**:

- **URL de callback**: `https://SEU-APP/api/webhooks/meta`
- **Token de verificação**: invente uma frase (ela vai para a variável `META_WEBHOOK_VERIFY_TOKEN`
  abaixo; não precisa ser complexa, só não pode ficar em branco nem ser o *nome* da variável).
- **Campos inscritos**: pelo menos `messages`.

## 4. Variáveis de ambiente do servidor

| Variável | Valor |
| --- | --- |
| `META_APP_ID` | ID do app, do topo do painel (passo 1) — usado só pelo Messenger |
| `META_APP_SECRET` | Chave secreta do app, do topo do painel (passo 1) — usado só pelo Messenger |
| `META_INSTAGRAM_APP_ID` | Instagram App ID (passo 2.1) — usado só pelo Instagram |
| `META_INSTAGRAM_APP_SECRET` | Instagram App Secret (passo 2.1) — usado só pelo Instagram |
| `META_WEBHOOK_VERIFY_TOKEN` | O token de verificação que você inventou no passo 3 (os dois produtos usam o mesmo) |

Sem as credenciais de um produto, a tela de Conexões mostra que aquele botão ainda não foi
configurado (os dois são independentes: dá para ativar o Messenger antes do Instagram, ou
vice-versa). Depois de criar ou alterar uma variável, é preciso um **novo deploy** para ela
valer — salvar na Vercel não é suficiente.

## 5. Revisão do app (App Review)

Enquanto o app estiver em modo de desenvolvimento ("Não publicado"), só contas cadastradas em
**Funções do app** conseguem conectar. Para qualquer cliente conectar, é preciso pedir à Meta a
revisão das permissões:

- `pages_show_list`, `pages_messaging`, `pages_manage_metadata` (Messenger)
- `instagram_business_basic`, `instagram_business_manage_messages` (Instagram)

A revisão pede um vídeo mostrando o uso de cada permissão e pode levar alguns dias.

## Como funciona depois de configurado

**Messenger:** o dono/administrador clica em "Conectar com Facebook", faz login, autoriza o
Tendi a ver suas páginas e escolhe uma. O token da página fica guardado no Vault do banco.

**Instagram:** o dono/administrador clica em "Conectar Instagram" e faz login direto com a conta
profissional do Instagram. Não há página para escolher — é sempre a conta que fez login.

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
  segue a documentação oficial, mas a Meta muda esses detalhes com frequência. Se algo não bater
  com o que a tela da Meta pedir, me avise com a mensagem de erro exata.
- **Live mode:** alguns recursos do Instagram só funcionam com o app publicado ("Live"), mesmo
  para o próprio dono testando. Se o login funcionar mas as mensagens não chegarem, veja em
  **Publicar** se o app precisa ser colocado no ar (isso não libera para o público, você controla
  quem usa pelas Funções do app).
