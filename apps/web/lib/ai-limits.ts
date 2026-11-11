/**
 * Limite e custo da IA. Funções puras (sem banco), usadas no servidor e nas páginas.
 *
 * Limite mensal de respostas (mês do calendário em Brasília):
 *  exceção da empresa (ai_agents.monthly_reply_limit) > limite do plano > padrão da plataforma;
 *  em teste gratuito, nunca passa do teto de teste.
 */

export type AiLimitSettings = { defaultMonthlyReplies: number; trialMonthlyReplies: number };
export type ModelPrice = { input: number; output: number };
export type AiPricing = { usdBrl: number; models: Record<string, ModelPrice> };

export const DEFAULT_LIMITS: AiLimitSettings = { defaultMonthlyReplies: 500, trialMonthlyReplies: 200 };
export const DEFAULT_PRICING: AiPricing = {
  usdBrl: 5.5,
  models: {
    'claude-haiku-5-5': { input: 0.1, output: 0.5 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-opus-5-5': { input: 4, output: 20 },
  },
};
/** Uso típico de uma resposta (prompt com base de conhecimento + histórico), para projeções. */
export const TYPICAL_REPLY_TOKENS = { input: 8_000, output: 600 };

const isRecord = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const nonNegative = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function normalizeLimits(value: unknown): AiLimitSettings {
  const source = isRecord(value) ? value : {};
  return {
    defaultMonthlyReplies: positiveInt(source.default_monthly_replies) ?? DEFAULT_LIMITS.defaultMonthlyReplies,
    trialMonthlyReplies: positiveInt(source.trial_monthly_replies) ?? DEFAULT_LIMITS.trialMonthlyReplies,
  };
}

export function normalizePricing(value: unknown): AiPricing {
  const source = isRecord(value) ? value : {};
  const models: Record<string, ModelPrice> = {};
  if (isRecord(source.models)) {
    for (const [model, price] of Object.entries(source.models)) {
      const input = nonNegative(isRecord(price) ? price.input : null);
      const output = nonNegative(isRecord(price) ? price.output : null);
      if (model.trim() && input !== null && output !== null) models[model.trim()] = { input, output };
    }
  }
  const usdBrl = Number(source.usd_brl);
  return {
    usdBrl: Number.isFinite(usdBrl) && usdBrl > 0 ? usdBrl : DEFAULT_PRICING.usdBrl,
    models: Object.keys(models).length ? models : DEFAULT_PRICING.models,
  };
}

/** Início do mês corrente em Brasília (UTC-3, sem horário de verão) como ISO em UTC. */
export function monthStartIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3, 0, 0)).toISOString();
}

export function resolveMonthlyLimit(input: {
  agentLimit?: number | null;
  planLimit?: number | null;
  isTrial: boolean;
  settings: AiLimitSettings;
}): number {
  const base = positiveInt(input.agentLimit) ?? positiveInt(input.planLimit) ?? input.settings.defaultMonthlyReplies;
  // A exceção da empresa é decisão explícita do Super Admin e vale também no teste.
  if (positiveInt(input.agentLimit)) return base;
  return input.isTrial ? Math.min(base, input.settings.trialMonthlyReplies) : base;
}

export function estimateCostUsd(pricing: AiPricing, model: string, inputTokens: number, outputTokens: number): number {
  const price = pricing.models[model];
  if (!price) return 0;
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Custo estimado (R$) de uma resposta típica do modelo. null se o modelo não tem preço cadastrado. */
export function typicalReplyCostBrl(pricing: AiPricing, model: string): number | null {
  if (!pricing.models[model]) return null;
  return estimateCostUsd(pricing, model, TYPICAL_REPLY_TOKENS.input, TYPICAL_REPLY_TOKENS.output) * pricing.usdBrl;
}

export type UsageLevel = 'ok' | 'warning' | 'reached';
export function usageLevel(used: number, limit: number): UsageLevel {
  if (used >= limit) return 'reached';
  return used >= limit * 0.8 ? 'warning' : 'ok';
}
