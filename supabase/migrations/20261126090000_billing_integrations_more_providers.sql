-- Amplia a 2ª via de boleto (Integrações) para aceitar Pagar.me (Stone) e Vindi, além do Asaas.
-- Os dois usam o mesmo modelo de "uma chave de API" que o Asaas, então encaixam sem mudar a
-- tabela além do check. Cora, Iugu, Juno, PagSeguro, Mercado Pago e InfinitePay ficaram de fora
-- desta etapa: ou exigem autenticação diferente (a Cora pede certificado mTLS, não uma chave) ou
-- a API pública deles não permite buscar cobranças pelo CPF/CNPJ do cliente final.
-- Migração somente aditiva: só troca o check de public.billing_integrations.provider.

alter table public.billing_integrations drop constraint if exists billing_integrations_provider_check;
alter table public.billing_integrations add constraint billing_integrations_provider_check
  check (provider in ('asaas', 'pagarme', 'vindi'));
