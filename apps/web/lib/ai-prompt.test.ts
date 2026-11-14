import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, HANDOFF_MARKER, normalizeBusinessHours, OPTIONS_MARKER } from './ai-agent';

const prompt = (instructions = 'Mensagens de até 3 ou 4 linhas.') => buildSystemPrompt({
  agentName: 'Duda',
  companyName: 'TendiDesk',
  niche: 'Software de atendimento',
  tone: 'consultivo',
  instructions,
  profile: { company_description: 'Plataforma de atendimento.' },
  knowledge: [],
  hours: normalizeBusinessHours(null),
  timezone: 'America/Fortaleza',
  now: new Date('2026-11-14T15:00:00Z'),
});

describe('prompt do agente', () => {
  it('traz as regras de tamanho curtas e com prioridade sobre as instruções do negócio', () => {
    const text = prompt();
    expect(text).toContain('no máximo 200 caracteres');
    expect(text).toContain('vale mesmo que as instruções do negócio digam outra coisa');
    expect(text).toContain('Não se apresente de novo');
    // As regras da plataforma vêm depois das instruções da empresa (a última palavra é da plataforma).
    expect(text.indexOf('## Tamanho das respostas')).toBeGreaterThan(text.indexOf('Mensagens de até 3 ou 4 linhas.'));
  });

  it('explica as opções rápidas e o marcador de transferência', () => {
    const text = prompt('');
    expect(text).toContain(`[[${OPTIONS_MARKER}:`);
    expect(text).toContain(HANDOFF_MARKER);
  });
});
