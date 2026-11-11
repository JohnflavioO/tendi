import type { PublicPlan } from '@/lib/public-plans';

/** Texto de venda de cada plano. Números (preço, usuários, IA) vêm do banco em lib/public-plans. */
export const planCopy: Record<string, { label: string; description: string; featured: boolean; ribbon?: string }> = {
  tendi_start: {
    label: 'Para equipes que estão começando',
    description: 'Organize o atendimento no WhatsApp e coloque a IA para responder enquanto sua equipe vende.',
    featured: false,
  },
  tendi_pro: {
    label: 'Para operações em crescimento',
    description: 'Mais pessoas, setores e respostas da IA para quem atende em volume.',
    featured: true,
    ribbon: 'Recomendado para operações em expansão',
  },
};

export const fallbackCopy = { label: 'Plano Tendi', description: 'Atendimento, CRM e IA em um só lugar.', featured: false };

const int = (value: number) => value.toLocaleString('pt-BR');

/** Lista "o que está incluído" a partir dos limites do plano. */
export function planFeatures(plan: PublicPlan): string[] {
  return [
    plan.maxUsers ? `Até ${int(plan.maxUsers)} usuários na equipe` : 'Usuários sem limite',
    plan.aiMonthlyReplies ? `Agente de IA no WhatsApp: até ${int(plan.aiMonthlyReplies)} respostas por mês` : 'Agente de IA no WhatsApp',
    'Inbox do WhatsApp compartilhado',
    'CRM com funil de vendas',
    'Papéis e permissões: dono, administrador, supervisor e atendente',
    ...(plan.maxTeams ? [`Até ${int(plan.maxTeams)} setores`] : []),
    ...(plan.boleto ? ['Recursos de segunda via de boleto'] : []),
  ];
}

/** Linhas da tabela de comparação (valor por plano, na ordem dos planos). */
export function comparisonRows(plans: PublicPlan[]): Array<{ feature: string; values: string[] }> {
  return [
    { feature: 'Usuários na equipe', values: plans.map(plan => (plan.maxUsers ? `Até ${int(plan.maxUsers)}` : 'Sem limite')) },
    { feature: 'Respostas da IA por mês', values: plans.map(plan => (plan.aiMonthlyReplies ? `Até ${int(plan.aiMonthlyReplies)}` : 'Incluídas')) },
    { feature: 'Setores', values: plans.map(plan => (plan.maxTeams ? `Até ${int(plan.maxTeams)}` : 'Estrutura essencial')) },
    { feature: 'Inbox do WhatsApp', values: plans.map(() => 'Incluído') },
    { feature: 'CRM com funil de vendas', values: plans.map(() => 'Incluído') },
    { feature: 'Papéis e permissões', values: plans.map(() => 'Incluído') },
    { feature: 'Segunda via de boleto', values: plans.map(plan => (plan.boleto ? 'Incluída' : 'Não incluída')) },
    { feature: 'Integrações adicionais', values: plans.map(() => 'Sob contratação') },
  ];
}
