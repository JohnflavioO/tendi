import { describe, expect, it } from 'vitest';
import { annualOffer, FALLBACK_PLANS, toPublicPlans } from './public-plans';
import { comparisonRows, planFeatures } from '../content/marketing/plans';
import { getFaqs } from '../content/marketing/site';

describe('planos do site', () => {
  it('converte as linhas do banco e ignora valores vazios', () => {
    const plans = toPublicPlans([{ code: 'tendi_start', name: 'TendiDesk Start', monthly_price: '189.00', annual_price: null, ai_monthly_replies: 1000, max_attendants: 4, max_teams: null, boleto_second_copy_enabled: false }, { nada: 1 }]);
    expect(plans).toEqual([{ code: 'tendi_start', name: 'TendiDesk Start', monthlyPrice: 189, annualPrice: null, aiMonthlyReplies: 1000, maxUsers: 4, maxTeams: null, boleto: false }]);
    expect(toPublicPlans(null)).toEqual([]);
  });

  it('oferta anual: valor por mês, economia e percentual', () => {
    expect(annualOffer(FALLBACK_PLANS[0]!)).toEqual({ perMonth: 160.65, total: 1927.8, savings: 340.2, percent: 15 });
    expect(annualOffer({ ...FALLBACK_PLANS[0]!, annualPrice: null })).toBeNull();
    expect(annualOffer({ ...FALLBACK_PLANS[0]!, annualPrice: 3000 })).toBeNull();
  });

  it('lista de recursos usa os limites do plano', () => {
    const features = planFeatures(FALLBACK_PLANS[1]!);
    expect(features).toContain('Até 10 usuários na equipe');
    expect(features).toContain('Agente de IA no WhatsApp: até 3.000 respostas por mês');
    expect(features).toContain('Até 10 setores');
    expect(planFeatures(FALLBACK_PLANS[0]!)).not.toContain('Recursos de segunda via de boleto');
  });

  it('comparação tem um valor por plano', () => {
    const rows = comparisonRows(FALLBACK_PLANS);
    expect(rows.every(row => row.values.length === 2)).toBe(true);
    expect(rows.find(row => row.feature === 'Respostas da IA por mês')!.values).toEqual(['Até 1.000', 'Até 3.000']);
  });

  it('dúvidas trazem preço, desconto anual e limites atuais', () => {
    const faqs = getFaqs('7 dias', FALLBACK_PLANS);
    // toLocaleString usa espaço não separável entre "R$" e o valor.
    const text = faqs.map(faq => `${faq.question} ${faq.answer}`).join(' ').replace(/ /g, ' ');
    expect(text).toContain('R$ 189,00/mês');
    expect(text).toContain('15% de desconto');
    expect(text).toContain('1.000 no TendiDesk Start');
    expect(text).toContain('até 10 usuários');
    expect(text).toContain('Pagar.me');
  });
});
