import { describe, expect, it } from 'vitest';
import { aiSigner, cleanName, humanSigner, normalizeSignature, signText } from './signature';

describe('assinatura', () => {
  it('padrão: ligada, primeiro nome, sem sufixo na IA', () => {
    expect(normalizeSignature(null)).toEqual({ enabled: true, format: 'first_name', aiSuffix: false });
    expect(normalizeSignature({ signature: { enabled: false, format: 'xyz' } })).toEqual({ enabled: false, format: 'first_name', aiSuffix: false });
  });
  it('nome do atendente conforme o formato', () => {
    expect(humanSigner({ name: 'Ana Souza', format: 'first_name' })).toBe('Ana');
    expect(humanSigner({ name: 'Ana Souza', format: 'full_name' })).toBe('Ana Souza');
    expect(humanSigner({ name: 'Ana Souza', team: 'Suporte', format: 'name_team' })).toBe('Ana · Suporte');
    expect(humanSigner({ name: 'Ana Souza', team: null, format: 'name_team' })).toBe('Ana Souza');
    expect(humanSigner({ name: '  ', format: 'first_name' })).toBe('');
  });
  it('limpa caracteres de formatação do WhatsApp', () => {
    expect(cleanName('*Ana*_\n Souza~')).toBe('Ana Souza');
  });
  it('IA e texto final', () => {
    expect(aiSigner('Bia', false)).toBe('Bia');
    expect(aiSigner('', true)).toBe('Assistente · assistente virtual');
    expect(signText('  Olá ', 'Ana')).toBe('*Ana:*\nOlá');
    expect(signText('Olá', '')).toBe('Olá');
  });
});
