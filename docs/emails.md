# E-mails de autenticação

Os e-mails de cadastro, convite e senha são enviados pelo Supabase Auth. Os modelos com a marca Tendi ficam em `supabase/templates/`. O projeto hospedado não lê esses arquivos sozinho: o conteúdo precisa ser colado no painel do Supabase.

## Onde colar

Painel do Supabase → **Authentication** → **Emails** → **Templates**. Para cada modelo, preencha o assunto e cole o HTML do arquivo.

| Modelo no painel | Arquivo | Assunto |
| --- | --- | --- |
| Confirm signup | `confirmacao-cadastro.html` | Confirme seu e-mail para começar no Tendi |
| Invite user | `convite.html` | {{ if .Data.inviter_name }}{{ .Data.inviter_name }} convidou você para a equipe no Tendi{{ else }}Você foi convidado para o Tendi{{ end }} |
| Reset password | `redefinir-senha.html` | Redefinir sua senha do Tendi |
| Magic link | `link-de-acesso.html` | {{ if .Data.needs_password }}Seu convite para o Tendi{{ else }}Seu link de acesso ao Tendi{{ end }} |
| Change email address | `alteracao-de-email.html` | Confirme seu novo e-mail no Tendi |

## Pré-requisitos

- **Site URL** (Authentication → URL Configuration) deve ser o endereço público do app. O logo do e-mail é carregado de `{Site URL}/brand/Logo%20Tendi.png`; com outro endereço, aparece só o texto "Tendi".
- **Remetente próprio**: para o e-mail sair como "Tendi" de um domínio da empresa, e não como "Supabase Auth", configure um SMTP próprio em Authentication → Emails → SMTP Settings. O envio padrão do Supabase é destinado a testes e tem limite baixo de mensagens por hora.

## Variáveis usadas

`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}` e `{{ .NewEmail }}` são preenchidas pelo Supabase no envio. Não as remova ao editar os textos.

## Convite de equipe personalizado

O convite enviado pela tela **Equipe** (e pelo Console, para o responsável da empresa) grava nos dados do usuário: `full_name`, `organization_name`, `inviter_name`, `role_label` e `needs_password`. Os modelos usam esses campos com `{{ .Data.campo }}` e blocos `{{ if .Data.campo }}…{{ else }}…{{ end }}`, então o e-mail mostra "Ana convidou você para a equipe da Clínica Sorriso" e o papel da pessoa; sem esses dados, cai no texto genérico.

**Reenviar convite** (botão na tela Equipe) manda o modelo **Magic link**: para quem ainda não criou a senha (`needs_password`), ele aparece como "Seu convite continua de pé". O link leva a `/auth/callback`, que ativa o convite e abre `/definir-senha`.

Se o painel não aceitar os blocos `{{ if }}` no **assunto**, use um assunto fixo (ex.: "Você foi convidado para uma equipe no Tendi").
