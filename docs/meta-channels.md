# Instagram e Messenger (Meta)

Como ativar os canais de Instagram e Messenger no Tendi. Depende de um app próprio da Tendi
cadastrado no Meta for Developers — ainda não existe, então os passos abaixo são necessários
antes que qualquer cliente consiga conectar uma página.

## 1. Criar o app na Meta

1. Entre em [developers.facebook.com](https://developers.facebook.com/) com uma conta que
   administre a página/Instagram que vai testar.
2. **Meus apps → Criar app → tipo "Negócios"**. Dê um nome (ex.: "Tendi").
3. No painel do app, adicione os produtos **Messenger** e **Instagram** (botão "Configurar" em cada um).
4. Em **Configurações básicas**, anote o **ID do app** e o **Chave secreta do app** (App Secret).

## 2. Login do Facebook (OAuth)

Em **Login do Facebook para Empresas** (ou "Facebook Login") → **Configurações**:

- **URIs de redirecionamento OAuth válidos**: `https://SEU-APP/api/meta/oauth/callback`

## 3. Webhook

Em **Messenger → Configurações do produto → Webhooks** (o mesmo endereço serve o Instagram):

- **URL de callback**: `https://SEU-APP/api/webhooks/meta`
- **Token de verificação**: invente uma frase (ela vai para a variável `META_WEBHOOK_VERIFY_TOKEN`
  abaixo; não precisa ser complexa, só não pode ficar em branco).
- **Campos inscritos**: `messages`, `messaging_postbacks`.

Repita a inscrição de campos em **Instagram → Configurações do produto → Webhooks**, apontando
para o mesmo endereço.

## 4. Variáveis de ambiente do servidor

| Variável | Valor |
| --- | --- |
| `META_APP_ID` | ID do app (passo 1) |
| `META_APP_SECRET` | Chave secreta do app (passo 1) |
| `META_WEBHOOK_VERIFY_TOKEN` | O token de verificação que você inventou no passo 3 |

Sem essas três, a tela de Conexões mostra que o canal ainda não foi configurado e ninguém
consegue clicar em "Conectar com Facebook".

## 5. Revisão do app (App Review)

Enquanto o app estiver em modo de desenvolvimento, só contas de **testador/administrador do
app** (cadastradas em **Funções do app** no painel da Meta) conseguem conectar uma página. Para
qualquer cliente conectar, é preciso solicitar à Meta a revisão das permissões:

- `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
- `instagram_basic`, `instagram_manage_messages`

A revisão pede um vídeo mostrando o uso de cada permissão e pode levar alguns dias.

## Como funciona depois de configurado

1. O dono ou administrador da empresa, em **Conexões**, clica em **Conectar com Facebook**.
2. Faz login e autoriza o Tendi a ver suas páginas.
3. Escolhe a página. Se ela tiver uma conta do Instagram ligada, as duas são conectadas juntas.
4. O token da página fica guardado no Vault do banco, nunca em uma coluna visível pelo workspace.
5. As mensagens recebidas no Instagram/Messenger passam a aparecer na Inbox do Tendi.

## O que ainda não existe

- **Responder pelo Inbox**: por enquanto, só a recepção está pronta. Enviar uma resposta de
  dentro do Tendi para o Instagram/Messenger ainda não foi implementado; responda direto pelo
  Instagram/Messenger enquanto isso.
- **Resposta automática da IA**: liberada só para WhatsApp e Webchat nesta etapa.
- **Nome do contato**: como o webhook não traz o nome de quem escreve, o contato chega como
  "Contato do Instagram/Messenger" — edite o nome manualmente em Contatos.
