import { describe, expect, it, vi } from 'vitest';
import { BOLETO_MARKER, extractBoletoRequest, formatBoletoMessage, maskDocument, normalizeDocument, notFoundMessage, type OpenBoleto } from './boleto';
import { AsaasError, asaasEnvironment, createAsaasProvider, friendlyAsaasError, looksLikeAsaasKey } from './boleto-asaas';
import { buildSystemPrompt, DEFAULT_BUSINESS_HOURS } from './ai-agent';

const boleto = (over: Partial<OpenBoleto> = {}): OpenBoleto => ({
  id: 'pay_1', amount: 189, dueDate: '2026-11-20', overdue: false, description: null,
  digitableLine: '23793.38128 60000.000003 00000.000400 1 84340000018900', pdfUrl: 'https://www.asaas.com/b/pdf/abc', invoiceUrl: 'https://www.asaas.com/i/abc', ...over,
});

describe('CPF e CNPJ', () => {
  it('aceita CPF e CNPJ válidos, com ou sem pontuação', () => {
    expect(normalizeDocument('529.982.247-25')).toBe('52998224725');
    expect(normalizeDocument('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('recusa dígito verificador errado, números repetidos e tamanhos estranhos', () => {
    expect(normalizeDocument('529.982.247-24')).toBeNull();
    expect(normalizeDocument('111.111.111-11')).toBeNull();
    expect(normalizeDocument('11.222.333/0001-82')).toBeNull();
    expect(normalizeDocument('1234')).toBeNull();
    expect(normalizeDocument(null)).toBeNull();
  });

  it('mascara o documento para não expor o número inteiro', () => {
    expect(maskDocument('52998224725')).toBe('CPF final 47-25');
    expect(maskDocument('11222333000181')).toBe('CNPJ final 01-81');
  });
});

describe('marcador da Duda', () => {
  it('tira o marcador e devolve só os dígitos do documento', () => {
    expect(extractBoletoRequest(`[[${BOLETO_MARKER}: 529.982.247-25]]`)).toEqual({ text: '', requested: true, document: '52998224725' });
  });

  it('texto sem marcador passa intacto', () => {
    expect(extractBoletoRequest('Me passa o seu CPF?')).toEqual({ text: 'Me passa o seu CPF?', requested: false, document: '' });
  });

  it('o prompt só fala de boleto quando a integração está ligada', () => {
    const base = { agentName: 'Duda', companyName: 'Escola', niche: '', tone: 'cordial' as const, instructions: '', profile: {}, knowledge: [], hours: DEFAULT_BUSINESS_HOURS, timezone: 'America/Fortaleza' };
    expect(buildSystemPrompt(base)).not.toContain(BOLETO_MARKER);
    const prompt = buildSystemPrompt({ ...base, boleto: true });
    expect(prompt).toContain(`[[${BOLETO_MARKER}:`);
    expect(prompt).toContain('a 2ª via de boleto você mesmo envia');
  });
});

describe('mensagem com o boleto', () => {
  it('um boleto: valor, vencimento, linha digitável e PDF', () => {
    const text = formatBoletoMessage([boleto()]);
    expect(text).toContain('Encontrei o seu boleto em aberto:');
    expect(text).toContain('R$ 189,00 · vence em 20/11/2026');
    expect(text).toContain('Linha digitável: 23793.38128');
    expect(text).toContain('PDF do boleto: https://www.asaas.com/b/pdf/abc');
    expect(text).not.toContain('*');
  });

  it('vários boletos: vencidos primeiro, no máximo três e aviso dos demais', () => {
    const text = formatBoletoMessage([
      boleto({ id: 'a', dueDate: '2026-12-20' }), boleto({ id: 'b', dueDate: '2026-10-20', overdue: true }),
      boleto({ id: 'c', dueDate: '2027-01-20' }), boleto({ id: 'd', dueDate: '2027-02-20' }),
    ]);
    expect(text).toContain('Encontrei 4 boletos em aberto');
    expect(text.indexOf('20/10/2026')).toBeLessThan(text.indexOf('20/12/2026'));
    expect(text).toContain('(vencido)');
    expect(text).not.toContain('20/02/2027');
    expect(text).toContain('Há mais 1 boleto em aberto');
    expect(text).toContain('juros e multa');
  });

  it('sem linha digitável, manda ao menos o link', () => {
    const text = formatBoletoMessage([boleto({ digitableLine: null, pdfUrl: null })]);
    expect(text).not.toContain('Linha digitável');
    expect(text).toContain('https://www.asaas.com/i/abc');
  });

  it('nada encontrado cita o documento mascarado', () => {
    expect(notFoundMessage('52998224725')).toContain('CPF final 47-25');
  });
});

describe('Asaas', () => {
  const KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDA';
  const SANDBOX = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDA';
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('descobre o ambiente pela chave', () => {
    expect(asaasEnvironment(KEY)).toBe('production');
    expect(asaasEnvironment(SANDBOX)).toBe('sandbox');
    expect(looksLikeAsaasKey(KEY)).toBe(true);
    expect(looksLikeAsaasKey('sk-ant-123')).toBe(false);
  });

  it('busca o cliente pelo CPF, junta vencidos e a vencer e pega a linha digitável', async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).access_token).toBe(SANDBOX);
      expect(url.startsWith('https://api-sandbox.asaas.com/v3/')).toBe(true);
      if (url.includes('/customers?')) return json({ data: [{ id: 'cus_1' }] });
      if (url.includes('status=OVERDUE')) return json({ data: [{ id: 'pay_old', status: 'OVERDUE', billingType: 'BOLETO', value: 50, dueDate: '2026-10-10', bankSlipUrl: 'https://x/pdf/old' }] });
      if (url.includes('status=PENDING')) return json({ data: [
        { id: 'pay_new', status: 'PENDING', billingType: 'UNDEFINED', value: 189.9, dueDate: '2026-11-20', bankSlipUrl: 'https://x/pdf/new', description: 'Mensalidade' },
        { id: 'pay_card', status: 'PENDING', billingType: 'CREDIT_CARD', value: 10, dueDate: '2026-11-21' },
      ] });
      if (url.endsWith('/pay_old/identificationField')) return json({ identificationField: '0001' });
      if (url.endsWith('/pay_new/identificationField')) return json({}, 404);
      throw new Error(`URL inesperada: ${url}`);
    });
    const result = await createAsaasProvider(fetchFn as any).findOpenBoletos(SANDBOX, '52998224725');
    expect(fetchFn.mock.calls[0]![0]).toContain('cpfCnpj=52998224725');
    expect(result).toEqual([
      expect.objectContaining({ id: 'pay_old', overdue: true, amount: 50, digitableLine: '0001', pdfUrl: 'https://x/pdf/old' }),
      expect.objectContaining({ id: 'pay_new', overdue: false, amount: 189.9, digitableLine: null, description: 'Mensalidade' }),
    ]);
  });

  it('chave recusada vira mensagem clara', async () => {
    const provider = createAsaasProvider((async () => json({ errors: [] }, 401)) as any);
    const error = await provider.verify(KEY).catch(e => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect(friendlyAsaasError(error)).toContain('recusou a chave');
  });

  it('confere a chave e lê o nome da conta (se der)', async () => {
    const provider = createAsaasProvider((async (url: string) => url.includes('commercialInfo') ? json({ companyName: 'Escola Alfa' }) : json({ data: [] })) as any);
    expect(await provider.verify(KEY)).toEqual({ environment: 'production', accountLabel: 'Escola Alfa' });
  });
});
