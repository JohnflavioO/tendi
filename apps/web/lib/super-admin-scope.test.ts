import { describe, expect, it } from 'vitest';
import { SUPER_ADMIN_AREAS, canAccessArea, type Area } from './team';

const ATTENDANCE: Area[] = ['inbox', 'agenda', 'crm', 'contatos', 'relatorios'];
const CONFIG: Area[] = ['chatbots', 'configuracoes', 'equipe', 'assinatura', 'ia'];

describe('escopo do Super Admin nas empresas dos clientes', () => {
  it.each(ATTENDANCE)('não abre a área de atendimento "%s" sem vínculo com a empresa', area => {
    expect(canAccessArea(null, true, area)).toBe(false);
  });

  it.each(CONFIG)('abre a área de configuração "%s"', area => {
    expect(canAccessArea(null, true, area)).toBe(true);
  });

  it('as áreas liberadas são só as de configuração da conta', () => {
    expect([...SUPER_ADMIN_AREAS].sort()).toEqual([...CONFIG].sort());
  });

  it('quem não é Super Admin e não tem vínculo não abre nada', () => {
    for (const area of [...ATTENDANCE, ...CONFIG]) expect(canAccessArea(null, false, area)).toBe(false);
  });

  it('Super Admin que também é membro da empresa segue o papel que tem nela', () => {
    expect(canAccessArea('agent', true, 'inbox')).toBe(true);
    expect(canAccessArea('owner', true, 'relatorios')).toBe(true);
  });

  it('o papel na empresa continua valendo para os demais usuários', () => {
    expect(canAccessArea('agent', false, 'inbox')).toBe(true);
    expect(canAccessArea('agent', false, 'configuracoes')).toBe(false);
    expect(canAccessArea('admin', false, 'assinatura')).toBe(true);
  });
});
