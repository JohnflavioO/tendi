# Domínio oficial: tendidesk.com.br

Roteiro para colocar o Tendi no domínio oficial **sem derrubar o WhatsApp, os pagamentos nem o login**.
Siga na ordem. O endereço antigo da Vercel (`*.vercel.app`) continua funcionando durante toda a troca,
então nada para enquanto os passos são feitos.

E-mail de suporte oficial: **suporte@tendidesk.com.br** (caixa na Hostinger).
Envio dos e-mails do sistema: **Resend** (domínio já verificado; registros `send.tendidesk.com.br` e `_dmarc`).

---

## 1. Vercel: ligar o domínio ao app

1. Vercel → projeto **tendi** → **Settings → Domains** → adicionar `tendidesk.com.br` e `www.tendidesk.com.br`
   (deixe o `www` redirecionando para `tendidesk.com.br`).
2. A Vercel mostra os registros de DNS que ela espera. Hoje o domínio aponta para a hospedagem da Hostinger
   (`A 2.57.91.91`). No painel de DNS da Hostinger:
   - **troque** o registro `A` de `@` pelo valor indicado pela Vercel (normalmente `76.76.21.21`);
   - **troque** o `www` por um `CNAME` para o valor indicado pela Vercel (normalmente `cname.vercel-dns.com`);
   - **não mexa** nos registros de e-mail: `MX` (mx1/mx2.hostinger.com), `TXT` do SPF, `_dmarc`,
     `send` e o DKIM do Resend.
3. Aguarde a Vercel marcar o domínio como **Valid** (de minutos a algumas horas). O HTTPS é emitido sozinho.

## 2. Vercel: variáveis de ambiente (Production)

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://tendidesk.com.br` |
| `DAPI_WEBHOOK_BASE_URL` | `https://tendidesk.com.br` |

Depois de salvar, faça **Redeploy** do último deploy de produção para as variáveis valerem.

## 3. Supabase: login e e-mails

**Authentication → URL Configuration**
- **Site URL:** `https://tendidesk.com.br` (o logo dos e-mails também sai daqui).
- **Redirect URLs:** adicionar `https://tendidesk.com.br/**`. Mantenha o endereço antigo da Vercel na lista
  até terminar a troca, para links de e-mail já enviados continuarem funcionando.

**Authentication → Emails → SMTP Settings** (Resend)

| Campo | Valor |
|---|---|
| Sender email | `naoresponda@tendidesk.com.br` (qualquer endereço do domínio verificado no Resend) |
| Sender name | `Tendi` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | uma **API key** do Resend (crie em Resend → API Keys, permissão *Sending access*) |

**Authentication → Emails → Templates:** cole os modelos de `supabase/templates/` (ver `docs/emails.md`).
Com o SMTP próprio, os e-mails saem como "Tendi" e sem o limite baixo do envio padrão do Supabase.

## 4. WhatsApp (D-API): apontar as sessões para o domínio novo

Console → **Conectividade WhatsApp** → **Endereço dos webhooks**: confira que mostra
`https://tendidesk.com.br` e clique em **Atualizar webhooks**. Todas as sessões passam a enviar as mensagens
para o domínio novo, **sem desconectar** o WhatsApp de nenhum cliente. Sessões que aparecerem com erro
"não existe mais" precisam ser reconectadas pelo QR Code naquela empresa.

## 5. Pagar.me: webhook de pagamentos

Abra o Console **pelo domínio novo** → **Pagamentos e assinaturas** → copie a URL do webhook
(começa com `https://tendidesk.com.br/api/webhooks/pagarme/`). No painel da Pagar.me/Stone → Webhooks,
**edite** o webhook existente trocando a URL (mesmos eventos). O código secreto continua o mesmo.

## 6. Meta (Instagram e Messenger)

No app da Meta (developers.facebook.com):
- **Facebook Login / Instagram → URIs de redirecionamento do OAuth válidos:** adicionar
  `https://tendidesk.com.br/api/meta/oauth/callback` e `https://tendidesk.com.br/api/meta/instagram/oauth/callback`.
- **Webhooks:** URL de callback `https://tendidesk.com.br/api/webhooks/meta` (mesmo token de verificação).
- **Domínios do app / Política de privacidade / Termos:** `tendidesk.com.br`,
  `https://tendidesk.com.br/privacidade` e `https://tendidesk.com.br/termos`.

## 7. Teste final

- [ ] `https://tendidesk.com.br` abre o site com cadeado (HTTPS) e `www` redireciona.
- [ ] Login e cadastro funcionam; o e-mail de confirmação chega de "Tendi" e não cai no spam.
- [ ] Convite de equipe chega com o layout novo e o link abre `tendidesk.com.br`.
- [ ] Mensagem de WhatsApp de teste aparece no Inbox; resposta enviada chega ao celular.
- [ ] Console → Pagamentos mostra a URL nova; um evento de teste da Pagar.me é recebido.
- [ ] Instagram/Messenger: mensagem de teste chega ao Inbox.

Depois de tudo validado, o endereço antigo da Vercel pode sair das Redirect URLs do Supabase.
