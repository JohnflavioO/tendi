-- Marca TendiDesk: nomes dos planos exibidos no site, na assinatura e no checkout.
-- Só troca o nome; código (tendi_start/tendi_pro), preço e vínculo com a Pagar.me não mudam.
update public.subscription_plans set name = 'TendiDesk Start', updated_at = now() where code = 'tendi_start' and name = 'Tendi Start';
update public.subscription_plans set name = 'TendiDesk Pro', updated_at = now() where code = 'tendi_pro' and name = 'Tendi Pro';
