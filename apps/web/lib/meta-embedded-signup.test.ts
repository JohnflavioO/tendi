import { describe, expect, it } from 'vitest';
import { isSignupBody, parseSignupMessage, signupLoginOptions } from './meta-embedded-signup';

const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { phone_number_id: '106540352242922', waba_id: '200000000000001', business_id: '1' } };

describe('janela do cadastro incorporado da Meta', () => {
  it('pede um código ao FB.login com a configuração do app', () => {
    expect(signupLoginOptions('1234567890')).toEqual({
      config_id: '1234567890', response_type: 'code', override_default_response_type: true, extras: { setup: {} },
    });
  });

  it('lê o fim do cadastro, em texto ou objeto, só vindo do facebook.com', () => {
    const expected = { kind: 'finish', wabaId: '200000000000001', phoneNumberId: '106540352242922' };
    expect(parseSignupMessage('https://www.facebook.com', JSON.stringify(finish))).toEqual(expected);
    expect(parseSignupMessage('https://business.facebook.com', finish)).toEqual(expected);
    expect(parseSignupMessage('https://facebook.com.evil.example', finish)).toBeNull();
    expect(parseSignupMessage('http://www.facebook.com', finish)).toBeNull();
    expect(parseSignupMessage('https://evil.example', finish)).toBeNull();
  });

  it('distingue cancelamento, erro e mensagens de outros tipos', () => {
    expect(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER_SETUP' } }))
      .toEqual({ kind: 'cancel', step: 'PHONE_NUMBER_SETUP' });
    expect(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'Falhou' } }))
      .toEqual({ kind: 'error', message: 'Falhou' });
    expect(parseSignupMessage('https://www.facebook.com', { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: {} }))
      .toMatchObject({ kind: 'error' });
    expect(parseSignupMessage('https://www.facebook.com', { type: 'OTHER' })).toBeNull();
    expect(parseSignupMessage('https://www.facebook.com', 'not json')).toBeNull();
  });

  it('recusa um fim sem conta ou número válidos', () => {
    expect(parseSignupMessage('https://www.facebook.com', { ...finish, data: { waba_id: 'abc' } })).toMatchObject({ kind: 'error' });
  });
});

describe('pedido ao servidor', () => {
  it('aceita só código e ids no formato esperado', () => {
    expect(isSignupBody({ code: 'AQB-signup-code', wabaId: '200000000000001', phoneNumberId: '106540352242922' })).toBe(true);
    expect(isSignupBody({ code: 'short', wabaId: '200000000000001', phoneNumberId: '106540352242922' })).toBe(false);
    expect(isSignupBody({ code: 'AQB-signup-code', wabaId: '2000; drop', phoneNumberId: '106540352242922' })).toBe(false);
    expect(isSignupBody(null)).toBe(false);
  });
});
