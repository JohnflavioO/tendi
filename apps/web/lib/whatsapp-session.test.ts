import { describe, expect, it } from 'vitest';
import { isOfficial, readConnectionType, sessionIdFor, settingsForType, stableSessionId } from './whatsapp-session';

const ORG = '637A9D9F-F621-4462-8445-DC3D2FD48304';

describe('código da sessão do WhatsApp', () => {
  it('é estável e só tem letras minúsculas, números e hífen', () => {
    expect(stableSessionId(ORG)).toBe('tendi-637a9d9f-f621-4462-8445-dc3d2fd48304');
    expect(stableSessionId('a b/c')).toBe('tendi-abc');
  });

  it('usa o código salvo quando ele é válido, e o estável quando não há ou é inválido', () => {
    expect(sessionIdFor(ORG, 'tendi-antigo-1')).toBe('tendi-antigo-1');
    expect(sessionIdFor(ORG, null)).toBe(stableSessionId(ORG));
    expect(sessionIdFor(ORG, 'Sessão Inválida')).toBe(stableSessionId(ORG));
  });
});

describe('tipo de número informado pelo provedor', () => {
  it('lê o connectionType do On Connect, dentro ou fora do envelope data', () => {
    expect(readConnectionType({ success: true, data: { status: 'connected', connectionType: 'official' } })).toBe('official');
    expect(readConnectionType({ success: true, status: 'connected', connectionType: 'unofficial' })).toBe('unofficial');
  });

  it('entende o provider quando o connectionType não vem', () => {
    expect(readConnectionType({ data: { provider: 'meta_cloud' } })).toBe('official');
    expect(readConnectionType({ data: { provider: 'whatsapp_web' } })).toBe('unofficial');
  });

  it('não supõe nada quando o provedor não informa (D-API original)', () => {
    expect(readConnectionType({ data: { status: 'connected', phone: '5585999990000' } })).toBeNull();
    expect(readConnectionType(null)).toBeNull();
  });
});

describe('configurações da conexão', () => {
  it('troca o tipo sem perder o restante das configurações', () => {
    const current = { provider: 'd-api', session_type: 'unofficial', connection_mode: 'qr', signature: { enabled: true } };
    const official = settingsForType(current, 'official');
    expect(official).toEqual({ provider: 'd-api', session_type: 'official', connection_mode: 'meta', signature: { enabled: true } });
    expect(isOfficial(official)).toBe(true);
    expect(settingsForType(official, 'unofficial')).toMatchObject({ session_type: 'unofficial', connection_mode: 'qr', signature: { enabled: true } });
    expect(isOfficial(null)).toBe(false);
  });
});
