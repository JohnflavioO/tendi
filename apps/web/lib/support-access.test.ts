import { describe, expect, it } from 'vitest';
import { cleanSupportCode, formatSupportCode, hoursLabel, supportGrantState, type SupportGrant } from './support-access';
import { pickOrganization, withOrganization } from './current-organization';

const now = new Date('2026-11-13T15:00:00Z');
const grant = (extra: Partial<SupportGrant> = {}): SupportGrant => ({
  id: 'g1', organization_id: 'o1', access_hours: 2, reason: null, created_at: '2026-11-13T14:55:00Z',
  code_expires_at: '2026-11-13T15:10:00Z', redeemed_at: null, access_expires_at: null, ended_at: null, ...extra,
});

describe('situação do acesso de suporte', () => {
  it('código dentro do prazo aguarda o suporte', () => {
    expect(supportGrantState(grant(), now)).toBe('waiting');
  });
  it('código que ninguém usou em 15 minutos vence', () => {
    expect(supportGrantState(grant({ code_expires_at: '2026-11-13T14:59:00Z' }), now)).toBe('code_expired');
  });
  it('código cancelado antes do uso', () => {
    expect(supportGrantState(grant({ ended_at: '2026-11-13T14:58:00Z' }), now)).toBe('cancelled');
  });
  it('acesso em andamento enquanto o prazo vale', () => {
    expect(supportGrantState(grant({ redeemed_at: '2026-11-13T14:56:00Z', access_expires_at: '2026-11-13T16:56:00Z' }), now)).toBe('active');
  });
  it('acesso termina no prazo ou quando alguém encerra', () => {
    expect(supportGrantState(grant({ redeemed_at: '2026-11-13T12:00:00Z', access_expires_at: '2026-11-13T14:00:00Z' }), now)).toBe('finished');
    expect(supportGrantState(grant({ redeemed_at: '2026-11-13T14:56:00Z', access_expires_at: '2026-11-13T16:56:00Z', ended_at: '2026-11-13T14:59:00Z' }), now)).toBe('finished');
  });
});

describe('código de suporte', () => {
  it('formata em dois blocos e limpa o que foi digitado', () => {
    expect(formatSupportCode('48392107')).toBe('4839 2107');
    expect(formatSupportCode('00012345')).toBe('0001 2345');
    expect(cleanSupportCode(' 4839-2107 ')).toBe('48392107');
    expect(cleanSupportCode('4839 2107 99')).toBe('48392107');
    expect(cleanSupportCode('abc')).toBe('');
  });
  it('escreve a duração', () => {
    expect(hoursLabel(1)).toBe('1 hora');
    expect(hoursLabel(4)).toBe('4 horas');
  });
});

describe('empresa atual da tela', () => {
  const visible = [{ id: 'studio' }, { id: 'tendi' }, { id: 'zeta' }];
  it('abre a empresa pedida no endereço quando ela é visível', () => {
    expect(pickOrganization(visible, new Set(['tendi']), 'zeta')?.id).toBe('zeta');
  });
  it('sem pedido, abre a primeira em que a pessoa trabalha, não a primeira do alfabeto', () => {
    expect(pickOrganization(visible, new Set(['tendi']), null)?.id).toBe('tendi');
    expect(pickOrganization(visible, new Set(['tendi']), 'inexistente')?.id).toBe('tendi');
  });
  it('sem nenhuma empresa de trabalho, cai na primeira visível; sem empresas, null', () => {
    expect(pickOrganization(visible, new Set(), null)?.id).toBe('studio');
    expect(pickOrganization([], new Set(), null)).toBeNull();
  });
  it('leva a empresa nos links do menu', () => {
    expect(withOrganization('/crm', 'abc')).toBe('/crm?organization=abc');
    expect(withOrganization('/assinatura?x=1', 'abc')).toBe('/assinatura?x=1&organization=abc');
    expect(withOrganization('/crm', null)).toBe('/crm');
  });
});
