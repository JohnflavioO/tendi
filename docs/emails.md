# E-mails de autenticação

Os e-mails de cadastro, convite e senha são enviados pelo Supabase Auth. Os modelos com a marca Tendi ficam em `supabase/templates/`. O projeto hospedado não lê esses arquivos sozinho: o conteúdo precisa ser colado no painel do Supabase.

## Onde colar

Painel do Supabase → **Authentication** → **Emails** → **Templates**. Para cada modelo, preencha o assunto e cole o HTML do arquivo.

| Modelo no painel | Arquivo | Assunto |
| --- | --- | --- |
| Confirm signup | `confirmacao-cadastro.html` | Confirme seu e-mail para começar no Tendi |
| Invite user | `convite.html` | Você foi convidado para o Tendi |
| Reset password | `redefinir-senha.html` | Redefinir sua senha do Tendi |
| Magic link | `link-de-acesso.html` | Seu link de acesso ao Tendi |
| Change email address | `alteracao-de-email.html` | Confirme seu novo e-mail no Tendi |

## Pré-requisitos

- **Site URL** (Authentication → URL Configuration) deve ser o endereço público do app. O logo do e-mail é carregado de `{Site URL}/brand/Logo%20Tendi.png`; com outro endereço, aparece só o texto "Tendi".
- **Remetente próprio**: para o e-mail sair como "Tendi" de um domínio da empresa, e não como "Supabase Auth", configure um SMTP próprio em Authentication → Emails → SMTP Settings. O envio padrão do Supabase é destinado a testes e tem limite baixo de mensagens por hora.

### SMTP com uma caixa de e-mail da Hostinger

Sem SMTP próprio o Supabase não deixa editar os modelos. Com uma caixa de e-mail já criada na Hostinger (ex.: `noreply@seudominio.com.br`):

| Campo no Supabase | Valor |
| --- | --- |
| Sender email address | o endereço da caixa (o mesmo do Username) |
| Sender name | `Tendi` |
| Host | `smtp.hostinger.com` |
| Port number | `465` |
| Username | o endereço completo da caixa |
| Password | a senha dessa caixa |

Depois de salvar, a aba **Templates** passa a aceitar edição.

## Variáveis usadas

`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}` e `{{ .NewEmail }}` são preenchidas pelo Supabase no envio. Não as remova ao editar os textos.

O convite também usa dados que o app envia junto: `{{ .Data.full_name }}`, `{{ .Data.organization_name }}` (nome da empresa) e `{{ .Data.invite_role }}` (presente só no convite do administrador da empresa). Os trechos `{{ if ... }} ... {{ end }}` fazem o texto se adaptar quando um desses dados não existe; mantenha cada `if` com o seu `end`.
