/**
 * Assinatura das mensagens no WhatsApp: o nome de quem respondeu aparece em negrito no topo do balão
 * que o cliente recebe ("*Ana:*"), para atendente humano e para o agente de IA.
 * Só o texto enviado ao WhatsApp é assinado; no Inbox a mensagem fica sem o prefixo (o Inbox já mostra quem enviou).
 * Configuração por workspace em channel_connections.settings.signature.
 */

export type SignatureFormat = 'first_name' | 'full_name' | 'name_team';
export type SignatureSettings = { enabled: boolean; format: SignatureFormat; aiSuffix: boolean };

export const DEFAULT_SIGNATURE: SignatureSettings = { enabled: true, format: 'first_name', aiSuffix: false };
export const SIGNATURE_FORMATS: Array<{ value: SignatureFormat; label: string; example: string }> = [
  { value: 'first_name', label: 'Primeiro nome', example: 'Ana' },
  { value: 'full_name', label: 'Nome completo', example: 'Ana Souza' },
  { value: 'name_team', label: 'Nome e setor', example: 'Ana · Suporte' },
];
export const AI_SUFFIX = 'assistente virtual';
const MAX_NAME = 40;

export function normalizeSignature(settings: unknown): SignatureSettings {
  const source = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).signature : null;
  const value = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const format = SIGNATURE_FORMATS.some(item => item.value === value.format) ? (value.format as SignatureFormat) : DEFAULT_SIGNATURE.format;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SIGNATURE.enabled,
    format,
    aiSuffix: typeof value.aiSuffix === 'boolean' ? value.aiSuffix : DEFAULT_SIGNATURE.aiSuffix,
  };
}

/** Remove o que quebraria a formatação do WhatsApp (asteriscos, sublinhado, quebras de linha). */
export function cleanName(value: string | null | undefined): string {
  return (value ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

/** Nome que assina a mensagem de um atendente. Vazio = não assina. */
export function humanSigner(input: { name: string | null | undefined; team?: string | null; format: SignatureFormat }): string {
  const full = cleanName(input.name);
  if (!full) return '';
  const name = input.format === 'first_name' ? full.split(' ')[0]! : full;
  const team = cleanName(input.team);
  return input.format === 'name_team' && team ? cleanName(`${name.split(' ')[0]} · ${team}`) : name;
}

/** Nome que assina a mensagem do agente de IA (ex.: "Bia" ou "Bia · assistente virtual"). */
export function aiSigner(agentName: string | null | undefined, aiSuffix: boolean): string {
  const name = cleanName(agentName) || 'Assistente';
  return aiSuffix ? cleanName(`${name} · ${AI_SUFFIX}`) : name;
}

/** "*Ana:*\nOlá ..." — o formato que o WhatsApp mostra em negrito no topo do balão. */
export function signText(text: string, signer: string): string {
  const body = text.trim();
  if (!body || !signer) return text;
  return `*${signer}:*\n${body}`;
}
