import type { PublicPlan } from '@/lib/public-plans';

export const siteContent = {
  brand: 'Tendi',
  eyebrow: 'ATENDIMENTO E GESTÃO COMERCIAL',
  heroTitle: 'Sua equipe atende melhor quando tudo está conectado.',
  heroDescription: 'Organize o WhatsApp da empresa, coloque um agente de IA para responder seus clientes e acompanhe cada oportunidade no CRM. Tudo em uma única plataforma.',
  primaryCta: 'Começar teste grátis',
  secondaryCta: 'Conhecer os planos',
  loginLabel: 'Entrar',
  footerDescription: 'Atendimento, relacionamento e operação comercial em um só lugar.',
  legalDraft: 'Este documento é uma versão preliminar e precisa de revisão jurídica antes da publicação definitiva.',
} as const;

export const navigation = [
  { label: 'Recursos', href: '#recursos' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Planos', href: '#planos' },
  { label: 'Dúvidas', href: '#faq' },
] as const;

export const features = [
  { id: 'inbox', eyebrow: 'ATENDIMENTO', title: 'Inbox do WhatsApp para toda a equipe', description: 'Conecte o número da empresa por QR Code e atenda em equipe: conversas, áudios, fotos e documentos no mesmo lugar.', detail: 'Histórico e painel do contato em cada conversa.' },
  { id: 'crm', eyebrow: 'COMERCIAL', title: 'CRM com funil de vendas', description: 'Quem chama pela primeira vez já vira oportunidade no funil. Acompanhe cada negociação até o fechamento.', detail: 'Etapas, valores e conversa a um clique.' },
  { id: 'ai', eyebrow: 'INTELIGÊNCIA ARTIFICIAL', title: 'Agente de IA que responde no WhatsApp', description: 'A IA aprende sobre o seu negócio, responde no seu tom, respeita o horário de atendimento e chama um atendente quando precisa.', detail: 'Incluído nos dois planos, com respostas mensais por plano.' },
  { id: 'teams', eyebrow: 'EQUIPE', title: 'Equipe com papéis e permissões', description: 'Convide pessoas por e-mail e defina quem é dono, administrador, supervisor ou atendente. Cada um vê só o que precisa.', detail: 'Setores para organizar a operação.' },
  { id: 'billing', eyebrow: 'AUTOMAÇÃO', title: 'Segunda via de boleto', description: 'No Tendi Pro, prepare a operação para atender pedidos de segunda via de boleto.', detail: 'Integrações financeiras definidas por provedor.' },
  { id: 'integrations', eyebrow: 'CONECTIVIDADE', title: 'Integrações conforme sua operação', description: 'Planeje conexões com ferramentas e serviços usados pela sua empresa.', detail: 'Integrações adicionais têm configuração e valores próprios.' },
] as const;

export const steps = [
  { number: '01', title: 'Crie sua conta e conecte o WhatsApp', description: 'Cadastre a empresa em minutos e conecte o número pelo QR Code. Sem cartão durante o teste.' },
  { number: '02', title: 'Convide a equipe e treine a IA', description: 'Chame atendentes e supervisores e conte para o agente de IA como sua empresa funciona.' },
  { number: '03', title: 'Atenda, venda e acompanhe', description: 'A IA responde, a equipe assume quando precisa e o CRM mostra cada oportunidade.' },
] as const;

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = (value: number) => value.toLocaleString('pt-BR');

export const getFaqs = (trialLabel: string, plans: PublicPlan[] = []) => {
  const start = plans.find(plan => plan.code === 'tendi_start') ?? plans[0];
  const pro = plans.find(plan => plan.code === 'tendi_pro') ?? plans[1];
  const annual = plans.find(plan => plan.monthlyPrice && plan.annualPrice);
  const annualPercent = annual ? Math.round((1 - annual.annualPrice! / (annual.monthlyPrice! * 12)) * 100) : 0;
  const users = [start, pro].filter(Boolean).map(plan => `o ${plan!.name} permite até ${int(plan!.maxUsers ?? 0)} usuários`).join(' e ');
  const replies = [start, pro].filter(plan => plan?.aiMonthlyReplies).map(plan => `${int(plan!.aiMonthlyReplies!)} no ${plan!.name}`).join(' e ');
  const prices = [start, pro].filter(plan => plan?.monthlyPrice).map(plan => `${plan!.name}: ${money(plan!.monthlyPrice!)}/mês`).join('; ');
  return [
    { question: 'Como funciona o teste gratuito?', answer: `Você tem ${trialLabel} para usar o Tendi com a sua equipe, inclusive o agente de IA (com um limite menor de respostas durante o teste). O cadastro não pede cartão e nada é cobrado.` },
    { question: 'Quanto custa depois do teste?', answer: `${prices || 'Os valores aparecem na seção de planos'}.${annualPercent > 0 ? ` No plano anual você paga uma vez por ano, com ${annualPercent}% de desconto.` : ''} A assinatura é feita dentro do Tendi, no cartão de crédito, com pagamento processado pela Pagar.me.` },
    { question: 'O que acontece quando o teste termina?', answer: 'O acesso fica pausado até você escolher um plano. Suas conversas, contatos e configurações continuam guardados e voltam assim que a assinatura é confirmada.' },
    { question: 'Quantas pessoas posso ter na equipe?', answer: `${users ? users.charAt(0).toUpperCase() + users.slice(1) : 'Depende do plano'}. Você convida por e-mail e escolhe o papel de cada um: dono, administrador, supervisor ou atendente.` },
    { question: 'Como funciona o agente de IA?', answer: 'Você conta para a IA sobre o seu negócio (produtos, preços, horários e regras). Ela responde os clientes no WhatsApp no tom que você escolher e, quando o assunto pede uma pessoa, avisa o cliente e passa a conversa para a equipe.' },
    { question: 'Existe limite de uso da IA?', answer: `Sim. Cada plano inclui uma quantidade de respostas da IA por mês${replies ? ` (${replies})` : ''}. O limite renova todo mês e, se acabar, as conversas continuam normalmente com a sua equipe.` },
    { question: 'Posso pagar por ano?', answer: annualPercent > 0 ? `Sim. O plano anual sai com ${annualPercent}% de desconto em relação a 12 mensalidades, cobrado uma vez por ano no cartão.` : 'No momento a cobrança é mensal, no cartão de crédito.' },
    { question: 'Como troco de plano ou cancelo?', answer: 'Fale com o nosso suporte em suporte@tendi.app e ajustamos a sua assinatura.' },
    { question: 'A segunda via de boleto já está integrada a qualquer banco?', answer: 'Não. As integrações financeiras são definidas por provedor e disponibilidade técnica. Não anunciamos conexão bancária que ainda não foi homologada.' },
  ];
};
