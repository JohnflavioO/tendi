import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider } from './ai-agent';

/**
 * Chamada ao modelo de IA (Claude pela SDK oficial da Anthropic; OpenAI pela API HTTP).
 * Recebe o prompt de sistema e o histórico já no formato user/assistant e devolve só o texto.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type GenerateInput = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  system: string;
  messages: ChatTurn[];
  timeoutMs?: number;
};
export type GenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** true quando o modelo recusou responder (política de segurança). */
  refused: boolean;
};
export type GenerateFn = (input: GenerateInput) => Promise<GenerateResult>;

// Respostas de WhatsApp são curtas; a margem cobre o raciocínio interno do modelo.
const MAX_TOKENS = 4000;

/** Junta mensagens seguidas do mesmo lado e garante que a conversa comece pelo cliente. */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const turn of turns) {
    const content = turn.content.trim();
    if (!content) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n${content}`;
    else merged.push({ role: turn.role, content });
  }
  while (merged.length && merged[0]!.role !== 'user') merged.shift();
  return merged;
}

/** Modelos Claude que aceitam o parâmetro effort (os anteriores rejeitam com erro 400). */
export function supportsEffort(model: string): boolean {
  return /^claude-(fable|mythos|opus|sonnet|haiku)-5/.test(model) || /^claude-opus-4-[5-8]/.test(model) || /^claude-sonnet-4-6/.test(model);
}

async function generateWithClaude(input: GenerateInput, messages: ChatTurn[]): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: input.apiKey, timeout: input.timeoutMs ?? 30_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: input.model,
    max_tokens: MAX_TOKENS,
    system: input.system,
    messages,
    // Atendimento por chat: esforço baixo = respostas rápidas e baratas.
    ...(supportsEffort(input.model) ? { output_config: { effort: 'low' as const } } : {}),
  });
  const text = response.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  return {
    text,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    refused: response.stop_reason === 'refusal',
  };
}

async function generateWithOpenAi(input: GenerateInput, messages: ChatTurn[]): Promise<GenerateResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({
      model: input.model,
      max_completion_tokens: MAX_TOKENS,
      messages: [{ role: 'system', content: input.system }, ...messages],
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
  });
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`OpenAI: ${message}`);
  }
  const choice = payload?.choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
  return {
    text,
    inputTokens: Number(payload?.usage?.prompt_tokens ?? 0) || 0,
    outputTokens: Number(payload?.usage?.completion_tokens ?? 0) || 0,
    refused: typeof choice?.message?.refusal === 'string' && choice.message.refusal.length > 0,
  };
}

export const generateReply: GenerateFn = async input => {
  const messages = normalizeTurns(input.messages);
  if (!messages.length) throw new Error('Conversa sem mensagem do cliente para responder.');
  return input.provider === 'openai' ? generateWithOpenAi(input, messages) : generateWithClaude(input, messages);
};

/** Mensagem curta e segura para mostrar ao Super Admin quando a chamada falha. */
export function friendlyAiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'A Anthropic recusou a chave de API (inválida ou revogada).';
  if (error instanceof Anthropic.PermissionDeniedError) return 'A chave da Anthropic não tem permissão para este modelo.';
  if (error instanceof Anthropic.NotFoundError) return 'Modelo não encontrado na Anthropic. Confira o nome do modelo.';
  if (error instanceof Anthropic.RateLimitError) return 'Limite de uso da Anthropic atingido. Tente novamente em instantes.';
  if (error instanceof Anthropic.BadRequestError) return `A Anthropic recusou a requisição: ${error.message.slice(0, 200)}`;
  if (error instanceof Anthropic.APIConnectionError) return 'Não foi possível conectar à Anthropic.';
  if (error instanceof Anthropic.APIError) return `Erro da Anthropic (${error.status ?? 'sem status'}).`;
  const message = error instanceof Error ? error.message : String(error);
  if (/incorrect api key|invalid api key|401/i.test(message)) return 'A OpenAI recusou a chave de API.';
  return message.slice(0, 240);
}
