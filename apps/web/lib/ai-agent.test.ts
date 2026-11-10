import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUSINESS_HOURS as H,
  HANDOFF_MARKER,
  MAX_KNOWLEDGE_CHARS,
  buildSystemPrompt,
  countKnowledgeChars,
  describeBusinessHours,
  isValidTimezone,
  isWithinBusinessHours,
  normalizeBusinessHours,
  validateBusinessHours,
  type BusinessHours,
} from './ai-agent';

const Z = 'America/Fortaleza'; // UTC-3, sem horário de verão. 10/11/2026 é terça-feira.
const at = (iso: string) => new Date(iso);

describe('isWithinBusinessHours', () => {
  it('respeita início inclusivo e fim exclusivo no fuso local', () => {
    expect(isWithinBusinessHours(H, Z, at('2026-11-10T10:59:00Z'))).toBe(false); // 07:59
    expect(isWithinBusinessHours(H, Z, at('2026-11-10T11:00:00Z'))).toBe(true); // 08:00
    expect(isWithinBusinessHours(H, Z, at('2026-11-10T20:59:00Z'))).toBe(true); // 17:59
    expect(isWithinBusinessHours(H, Z, at('2026-11-10T21:00:00Z'))).toBe(false); // 18:00
  });
  it('usa o dia local, não o dia UTC', () => {
    expect(isWithinBusinessHours(H, Z, at('2026-11-11T02:30:00Z'))).toBe(false); // terça 23:30 em Fortaleza
  });
  it('dias desativados ficam fora; dia ativado entra', () => {
    const sat: BusinessHours = { ...H, sat: { enabled: true, start: '08:00', end: '12:00' } };
    expect(isWithinBusinessHours(H, Z, at('2026-11-14T15:00:00Z'))).toBe(false);
    expect(isWithinBusinessHours(sat, Z, at('2026-11-14T13:00:00Z'))).toBe(true);
  });
  it('respeita outros fusos e tolera fuso inválido', () => {
    expect(isWithinBusinessHours(H, 'America/Manaus', at('2026-11-10T11:30:00Z'))).toBe(false);
    expect(isWithinBusinessHours(H, 'Fuso/Invalido', at('2026-11-10T17:00:00Z'))).toBe(true);
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('xxx')).toBe(false);
  });
});

describe('normalizeBusinessHours / validateBusinessHours / describeBusinessHours', () => {
  it('completa e corrige o JSON vindo do banco', () => {
    const n = normalizeBusinessHours({ mon: { enabled: false, start: '9:00', end: '25:00' }, tue: 'lixo', fri: { start: '07:30' } });
    expect(n.mon).toEqual({ enabled: false, start: '08:00', end: '18:00' });
    expect(n.tue.enabled).toBe(true);
    expect(n.fri.start).toBe('07:30');
    expect(normalizeBusinessHours(null)).toEqual(H);
    expect(normalizeBusinessHours([1])).toEqual(H);
  });
  it('só reclama de fim antes do início em dias ativos', () => {
    expect(validateBusinessHours(H)).toBeNull();
    expect(validateBusinessHours({ ...H, tue: { enabled: true, start: '18:00', end: '08:00' } })).toMatch(/Terça/);
    expect(validateBusinessHours({ ...H, tue: { enabled: false, start: '18:00', end: '08:00' } })).toBeNull();
  });
  it('descreve agrupando dias seguidos iguais', () => {
    expect(describeBusinessHours(H)).toBe('seg a sex 08:00–18:00');
    expect(describeBusinessHours({ ...H, sat: { enabled: true, start: '08:00', end: '12:00' } })).toBe('seg a sex 08:00–18:00; sáb 08:00–12:00');
    expect(describeBusinessHours({ ...H, wed: { enabled: false, start: '08:00', end: '18:00' } })).toBe('seg a ter 08:00–18:00; qui a sex 08:00–18:00');
  });
});

describe('buildSystemPrompt', () => {
  const base = {
    agentName: 'Bia', companyName: 'Clínica Sorriso', niche: 'odontologia', tone: 'consultivo' as const,
    instructions: 'Agende avaliações; nunca informe diagnóstico.',
    profile: { company_description: 'Clínica em Fortaleza.', products_services: 'Limpeza R$ 150.', policies: 'Pagamento em até 6x.', greeting_message: 'Olá! Sou a Bia.' },
    knowledge: [{ title: 'Convênios', content: 'Aceitamos Unimed.' }, { title: 'Oculto', content: 'não deve aparecer', is_active: false }],
    hours: H, timezone: Z,
  };
  it('inclui os dados da empresa e só itens ativos da base', () => {
    const p = buildSystemPrompt({ ...base, now: at('2026-11-10T17:00:00Z') });
    for (const text of ['Você é Bia', 'Clínica Sorriso', 'odontologia', 'Agende avaliações', 'Limpeza R$ 150', 'Pagamento em até 6x', 'Olá! Sou a Bia.', '### Convênios']) expect(p).toContain(text);
    expect(p).not.toContain('Oculto');
  });
  it('orienta a transferência conforme o horário', () => {
    const inside = buildSystemPrompt({ ...base, now: at('2026-11-10T17:00:00Z') });
    expect(inside).toContain('DENTRO do horário');
    expect(inside).toContain(HANDOFF_MARKER);
    const outside = buildSystemPrompt({ ...base, now: at('2026-11-14T15:00:00Z') });
    expect(outside).toContain('FORA do horário');
    expect(outside).toContain('NÃO prometa atendimento imediato');
  });
  it('não gera seções vazias e sempre traz as regras fixas', () => {
    const p = buildSystemPrompt({ ...base, instructions: '', niche: '', profile: {}, knowledge: [], agentName: '' });
    expect(p).not.toContain('Instruções específicas');
    expect(p).not.toContain('Base de conhecimento');
    expect(p).toContain('Regras de atendimento');
  });
  it('respeita o limite da base de conhecimento', () => {
    const big = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, content: 'x'.repeat(4000) }));
    const p = buildSystemPrompt({ ...base, knowledge: big });
    expect(p).toContain('não couberam');
    expect(p.length).toBeLessThan(MAX_KNOWLEDGE_CHARS + 6000);
    expect(countKnowledgeChars(base.knowledge)).toBe('Convênios'.length + 'Aceitamos Unimed.'.length);
  });
});
