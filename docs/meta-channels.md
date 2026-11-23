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

> **Não é mais usada.** Essa configuração só entrega permissões de Instagram, sem as de Página, e sem
> a Página não há como enviar mensagens. O botão "Conectar Instagram" agora usa o mesmo login do
> Messenger, pedindo `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic`,
> `instagram_manage_messages` e `business_management`. Na janela da Meta, marque a Página e a conta do
> Instagram ligada a ela. Os URIs de redirecionamento continuam cadastrados no Login do Facebook para Empresas.

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
| `META_INSTAGRAM_CONFIG_ID` | Não é mais usada (veja a nota do passo 2.1) |
| `META_WEBHOOK_VERIFY_TOKEN` | O token de verificação que você inventou no passo 3 (os dois produtos usam o mesmo) |

Sem as credenciais de um produto, a tela de Conexões mostra que aquele botão ainda não foi
configurado (os dois são independentes: dá para ativar o Messenger antes do Instagram, ou
vice-versa — o Instagram só precisa, além do `META_APP_ID`/`META_APP_SECRET` já configurados para
o Messenger, do `META_INSTAGRAM_CONFIG_ID`). Depois de criar ou alterar uma variável, é preciso um
**novo deploy** para ela valer — salvar na Vercel não é suficiente.

## 5. Revisão do app (App Review)

**"Publicado" não é a mesma coisa que "permissão aprovada".** São dois controles separados da Meta:

- **Publicar o app** (menu **Publicar**) deixa o app visível/ativo publicamente.
- **Acesso avançado** a cada permissão sensível (`pages_show_list`, `pages_messaging`,
  `pages_manage_metadata` para o Messenger; `instagram_basic`, `instagram_manage_messages` para o
  Instagram) é o que permite o app atender **contas que o Tendi não é dono** — ou seja, os clientes
  de verdade. Isso exige dois pré-requisitos, nessa ordem:
  1. **Verificação da empresa** (Business Verification), em
     [business.facebook.com](https://business.facebook.com/) → Configurações → Central de
     segurança. Sem isso a Meta nem libera o Acesso avançado depois da análise.
  2. **Análise do app aprovada** (**Analisar → Análise do app**) para cada permissão.

Enquanto uma permissão estiver em **Acesso padrão** — análise não enviada, "Em andamento" ou
reprovada —, ela só funciona para **contas cadastradas em Funções do app** (dono, desenvolvedor,
testador), mesmo com o app publicado e a empresa verificada. **Isso não é um substituto para
produção**: cadastrar o Instagram de um cliente como testador deixa aquela conta específica
funcionar (foi assim que validamos o fluxo internamente), mas não resolve para os clientes reais
dela — cada cliente final da Tendi precisaria virar testador, o que não escala. Só o Acesso
avançado aprovado libera para qualquer conta, sem cadastrar ninguém.

**O que fazer:**

1. Confirmar a Verificação da empresa (já feita, nesse caso).
2. Enviar/acompanhar a análise em **Analisar → Análise do app**, pedindo Acesso avançado para
   `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic` e
   `instagram_manage_messages`. A Meta pede um vídeo mostrando o uso de cada permissão; a análise
   costuma levar até 20 dias (acompanhe em **Analisar → Análise do app → Ver detalhes do envio**).
3. **Enquanto a análise não sai**, usar Funções do app só para o próprio time testar — não
   divulgar o recurso de Instagram para clientes reais até o Acesso avançado ser aprovado.
4. **Depois que a Meta aprovar**, as permissões passam a valer para qualquer conta, sem precisar
   cadastrar ninguém em Funções do app.

## Como funciona depois de configurado

**Messenger:** o dono/administrador clica em "Conectar com Facebook", faz login, autoriza o
Tendi a ver suas páginas e escolhe uma. O token da página fica guardado no Vault do banco.

**Instagram:** o dono/administrador clica em "Conectar Instagram" e faz login pela mesma tela do
Facebook, autorizando a Configuração de login cadastrada. Como ela já fixa a Página e a conta do
Instagram, não há etapa de escolha: a conexão usa direto a conta vinculada, e o token guardado no
Vault é o da Página (é ele que autoriza enviar mensagens pela conta do Instagram).

Depois de conectado, as mensagens recebidas em qualquer um dos dois passam a aparecer na Inbox
do Tendi.

## Responder e IA

- **Responder pelo Inbox:** a equipe responde no Instagram e no Messenger pelo próprio Inbox. Por
  enquanto só texto (sem anexo nem áudio), até 1000 caracteres no Instagram e 2000 no Messenger.
- **Agente de IA:** responde **só no Instagram**, seguindo o mesmo agente do WhatsApp (ligar/desligar,
  instruções, limite mensal). No Messenger a conversa fica sempre com a equipe.
- **Janela de 24 h da Meta:** só é possível responder até 24 h depois da última mensagem do cliente.
  Fora disso o Tendi não envia: a IA passa a conversa para a equipe e o Inbox mostra o aviso.
- **Passagem para a equipe:** quando a IA chama um atendente ou alguém responde pelo Inbox, a IA para
  naquela conversa, como no WhatsApp.

## Limitações conhecidas

- **Nome do contato**: como o webhook não traz o nome de quem escreve, o contato chega como
  "Contato do Instagram/Messenger" — edite o nome manualmente em Contatos.
- **Este fluxo ainda não foi testado contra a API real da Meta.** Ele segue a documentação e o
  que o painel da Meta mostrou durante a configuração, mas a Meta muda esses detalhes com
  frequência. Se algo não bater, anote a mensagem de erro exata.
