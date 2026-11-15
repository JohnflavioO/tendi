/**
 * Segunda via de boleto (plano Pro): tipos, interface de provedor e regras puras (sem banco e sem rede).
 *
 * A empresa conecta o sistema de cobrança dela (hoje o Asaas) em Integrações. Quando o cliente pede a
 * 2ª via, a Duda pede o CPF ou CNPJ e devolve o marcador [[SEGUNDA_VIA: documento]]; o servidor busca
 * os boletos em aberto no provedor e envia a linha digitável e o link do PDF.
 */

export const BOLETO_MARKER = 'SEGUNDA_VIA';
/** Quantos boletos vão numa mensagem (os de vencimento mais próximo). */
export const MAX_BOLETOS_PER_MESSAGE = 3;
/** Consultas por conversa em 24 h: evita que alguém teste vários CPFs pelo chat. */
export const MAX_BOLETO_LOOKUPS_PER_DAY = 5;

export type BoletoProviderId = 'asaas';

/** Boleto em aberto, já no formato do TendiDesk (independe do provedor). */
export type OpenBoleto = {
  id: string;
  amount: number;
  /** AAAA-MM-DD */
  dueDate: string;
  overdue: boolean;
  description: string | null;
  digitableLine: string | null;
  pdfUrl: string | null;
  /** Página da fatura no provedor (costuma ter Pix e boleto). */
  invoiceUrl: string | null;
};

export type ProviderAccount = { environment: 'production' | 'sandbox'; accountLabel: string | null };

/** O que cada sistema de cobrança precisa saber fazer. Novos provedores implementam esta interface. */
export interface BoletoProvider {
  id: BoletoProviderId;
  label: string;
  /** Confere a chave (lança erro amigável se não servir) e devolve dados da conta para mostrar na tela. */
  verify(apiKey: string): Promise<ProviderAccount>;
  /** Boletos em aberto (a vencer ou vencidos) do cliente com este CPF/CNPJ (só dígitos). */
  findOpenBoletos(apiKey: string, document: string): Promise<OpenBoleto[]>;
}

export const BOLETO_PROVIDERS: ReadonlyArray<{ id: BoletoProviderId; label: string; keyHelp: string; keyUrl: string }> = [
  {
    id: 'asaas',
    label: 'Asaas',
    keyHelp: 'No Asaas, abra Integrações > Chaves de API e gere uma chave. Ela começa com $aact_.',
    keyUrl: 'https://www.asaas.com/customerApiKeys/index',
  },
];

export const isBoletoProviderId = (value: unknown): value is BoletoProviderId => BOLETO_PROVIDERS.some(item => item.id === value);

// --- CPF / CNPJ -------------------------------------------------------------------------------------

const onlyDigits = (value: string) => value.replace(/\D/g, '');

function validCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function validCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, i) => total + Number(cnpj[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

/** CPF ou CNPJ válido, só com dígitos. null se o texto não for um documento válido. */
export function normalizeDocument(value: string | null | undefined): string | null {
  const digits = onlyDigits(value ?? '');
  if (digits.length === 11) return validCpf(digits) ? digits : null;
  if (digits.length === 14) return validCnpj(digits) ? digits : null;
  return null;
}

/** "CPF final 09-00" / "CNPJ final 01-95": identifica sem expor o documento inteiro. */
export function maskDocument(document: string): string {
  const digits = onlyDigits(document);
  const kind = digits.length === 14 ? 'CNPJ' : 'CPF';
  return `${kind} final ${digits.slice(-4, -2)}-${digits.slice(-2)}`;
}

// --- Marcador da Duda -------------------------------------------------------------------------------

const MARKER_PATTERN = new RegExp(`\\[\\[\\s*${BOLETO_MARKER}\\s*:?([^\\]]*)\\]\\]`, 'gi');

/**
 * Tira o marcador de 2ª via da resposta da IA. `requested` diz se a IA pediu a consulta; `document`
 * vem só com dígitos (pode ser inválido: quem chama confere com normalizeDocument).
 */
export function extractBoletoRequest(raw: string): { text: string; requested: boolean; document: string } {
  let requested = false;
  let document = '';
  const text = raw.replace(MARKER_PATTERN, (_match, value: string) => {
    if (!requested) { requested = true; document = onlyDigits(value ?? ''); }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, requested, document };
}

/** Trecho do prompt da Duda, incluído só quando a empresa tem a integração ativa. */
export function boletoPromptSection(): string[] {
  return [
    '',
    '## Segunda via de boleto',
    '- Você consegue enviar a 2ª via de boletos em aberto desta empresa.',
    '- Quando o cliente pedir boleto, 2ª via, linha digitável ou código de barras, peça o CPF ou CNPJ do titular, se ele ainda não informou nesta conversa. Esse é o único dado que você pode pedir para isso.',
    `- Assim que tiver o CPF ou CNPJ, responda SOMENTE com a linha [[${BOLETO_MARKER}: número informado]], sem nenhum outro texto. O sistema busca o boleto e envia ao cliente.`,
    '- Nunca invente linha digitável, valor ou vencimento. Se o cliente quiser negociar, parcelar ou contestar uma cobrança, transfira para um atendente.',
  ];
}

// --- Mensagem para o cliente ------------------------------------------------------------------------

// Espaço comum no lugar do não separável do Intl: copia e cola sem surpresa em qualquer canal.
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
const brDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
};

/** Ordena por vencimento (vencidos e mais próximos primeiro). */
export function sortBoletos(boletos: OpenBoleto[]): OpenBoleto[] {
  return [...boletos].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Texto enviado ao cliente com até 3 boletos. Sem markdown, para servir em todos os canais. */
export function formatBoletoMessage(boletos: OpenBoleto[]): string {
  const sorted = sortBoletos(boletos);
  const shown = sorted.slice(0, MAX_BOLETOS_PER_MESSAGE);
  const intro = shown.length === 1 ? 'Encontrei o seu boleto em aberto:' : `Encontrei ${sorted.length} boletos em aberto:`;
  const blocks = shown.map(boleto => {
    const lines = [`${brl(boleto.amount)} · vence em ${brDate(boleto.dueDate)}${boleto.overdue ? ' (vencido)' : ''}`];
    if (boleto.description) lines.push(boleto.description.slice(0, 80));
    if (boleto.digitableLine) lines.push(`Linha digitável: ${boleto.digitableLine}`);
    const link = boleto.pdfUrl ?? boleto.invoiceUrl;
    if (link) lines.push(`PDF do boleto: ${link}`);
    return lines.join('\n');
  });
  const rest = sorted.length - shown.length;
  const outro = rest > 0
    ? `Há mais ${rest} ${rest === 1 ? 'boleto' : 'boletos'} em aberto. Se precisar, nossa equipe envia os demais.`
    : 'Se já pagou, pode desconsiderar. O pagamento leva até 3 dias úteis para compensar.';
  const overdueNote = shown.some(boleto => boleto.overdue) ? '\nBoleto vencido pode ter juros e multa; o link acima já mostra o valor atualizado.' : '';
  return `${intro}\n\n${blocks.join('\n\n')}\n\n${outro}${overdueNote}`;
}

export function notFoundMessage(document: string): string {
  return `Não encontrei boleto em aberto para o ${maskDocument(document)}. Se o boleto estiver em outro CPF ou CNPJ, é só me mandar o número.`;
}

export const INVALID_DOCUMENT_MESSAGE = 'Esse CPF ou CNPJ não parece válido. Pode conferir e me mandar de novo, só os números?';
export const LOOKUP_FAILED_MESSAGE = 'Não consegui consultar o boleto agora. Vou chamar alguém da nossa equipe para te enviar a 2ª via.';
export const LOOKUP_LIMIT_MESSAGE = 'Já fizemos várias consultas por aqui hoje. Vou chamar alguém da nossa equipe para te ajudar com o boleto.';

/** Chave que fica guardada só como os 4 últimos caracteres, para a tela mostrar qual está em uso. */
export function keyHint(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
