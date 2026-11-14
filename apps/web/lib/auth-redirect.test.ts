import { describe, expect, it } from 'vitest';
import { destinationAfterLink, isOtpType, RESET_PASSWORD_PATH, safeNext } from './auth-redirect';

describe('safeNext', () => {
  it('aceita só caminhos internos', () => {
    expect(safeNext('/definir-senha?modo=redefinir')).toBe('/definir-senha?modo=redefinir');
    expect(safeNext('/inbox')).toBe('/inbox');
  });
  it('recusa outros sites e truques de endereço', () => {
    expect(safeNext('https://golpe.com')).toBeNull();
    expect(safeNext('//golpe.com/x')).toBeNull();
    expect(safeNext('/\\golpe.com')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext('/ok\r\nSet-Cookie: x')).toBeNull();
    expect(safeNext('')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('destino depois do link', () => {
  it('redefinição de senha sempre vai para a tela de nova senha', () => {
    expect(destinationAfterLink({ type: 'recovery', needsPassword: false, next: '/admin' })).toBe(RESET_PASSWORD_PATH);
  });
  it('convite sem senha vai criar a senha; os demais seguem o destino ou o Inbox', () => {
    expect(destinationAfterLink({ type: 'invite', needsPassword: true, next: null })).toBe('/definir-senha');
    expect(destinationAfterLink({ type: 'magiclink', needsPassword: false, next: '/crm' })).toBe('/crm');
    expect(destinationAfterLink({ type: 'magiclink', needsPassword: false, next: null })).toBe('/inbox');
  });
  it('tipos de link aceitos', () => {
    expect(isOtpType('recovery')).toBe(true);
    expect(isOtpType('qualquer')).toBe(false);
  });
});
