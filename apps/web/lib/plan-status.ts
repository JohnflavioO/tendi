import { trialDaysLeft, isTrialExpired } from './trial';
import { complimentaryDaysLeft, isComplimentaryActive, isComplimentaryExpired } from './complimentary';

/** Situação do plano da empresa em texto para o cliente (Configurações, avisos). */
export type PlanStatus = { label: string; detail: string; tone: 'ok' | 'trial' | 'warning' | 'blocked' };

export function planStatus(input: {
  status?: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: string | null;
  billingPeriod?: string | null;
  complimentarySince?: string | null;
  complimentaryUntil?: string | null;
  now?: Date;
}): PlanStatus {
  const now = input.now ?? new Date();
  if (input.status === 'suspended') return { label: 'Acesso pausado', detail: 'Assine um plano para voltar a usar o TendiDesk.', tone: 'blocked' };
  // Cortesia vem antes da cobrança: a empresa liberada não vê "pagamento pendente" nem "teste encerrado".
  const complimentary = { complimentary_since: input.complimentarySince ?? null, complimentary_until: input.complimentaryUntil ?? null };
  if (isComplimentaryActive(complimentary, now)) {
    const days = complimentaryDaysLeft(complimentary, now);
    const left = days === null ? '' : days === 0 ? ' Termina hoje.' : ` Faltam ${days} ${days === 1 ? 'dia' : 'dias'}.`;
    return { label: 'Conta cortesia', detail: `Liberada pela equipe TendiDesk, sem cobrança.${left}`, tone: 'ok' };
  }
  if (isComplimentaryExpired(complimentary, now) && input.subscriptionStatus !== 'active' && input.subscriptionStatus !== 'past_due') {
    return { label: 'Cortesia encerrada', detail: 'Assine um plano para continuar.', tone: 'blocked' };
  }
  if (input.subscriptionStatus === 'past_due') return { label: 'Pagamento pendente', detail: 'A cobrança do cartão não passou. Ela será tentada de novo nos próximos dias.', tone: 'warning' };
  if (input.subscriptionStatus === 'active') {
    return { label: 'Assinatura ativa', detail: input.billingPeriod === 'annual' ? 'Cobrança anual no cartão de crédito.' : 'Cobrança mensal no cartão de crédito.', tone: 'ok' };
  }
  if (input.status === 'trial') {
    const organization = { status: input.status, trial_ends_at: input.trialEndsAt ?? null };
    if (isTrialExpired(organization, now)) return { label: 'Teste encerrado', detail: 'Assine um plano para continuar.', tone: 'blocked' };
    const days = trialDaysLeft(organization, now);
    return {
      label: 'Teste grátis',
      detail: days === null ? 'Período de teste em andamento.' : days === 0 ? 'Termina hoje.' : `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}.`,
      tone: 'trial',
    };
  }
  return { label: 'Ativa', detail: 'Conta ativa.', tone: 'ok' };
}
