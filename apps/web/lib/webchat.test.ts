import { describe, expect, it } from 'vitest';
import {
  WEBCHAT_CORS_HEADERS, buildWebchatEmbedSnippet, checkDisplayName, checkGreeting, checkWebchatMessage, isValidWebchatColor,
  isValidWebchatPublicKey, tooManyWebchatMessages,
} from './webchat';

describe('chave pública do widget', () => {
  it.each(['0123456789abcdef0123456789abcdef', 'ABCDEF0123456789abcdef0123456789'.slice(0, 32)])('aceita %s', value => {
    expect(isValidWebchatPublicKey(value)).toBe(true);
  });
  it.each(['', 'abc', '0123456789abcdef0123456789abcdeg', 'short', null, undefined, 123])('recusa %s', value => {
    expect(isValidWebchatPublicKey(value)).toBe(false);
  });
});

describe('cor do widget', () => {
  it.each(['#004751', '#ABCDEF'])('aceita %s', value => expect(isValidWebchatColor(value)).toBe(true));
  it.each(['004751', '#00475', '#0047511', 'red', null])('recusa %s', value => expect(isValidWebchatColor(value)).toBe(false));
});

describe('mensagem do visitante', () => {
  it('aceita texto dentro do limite', () => {
    expect(checkWebchatMessage('  Olá, tudo bem?  ')).toEqual({ ok: true, text: 'Olá, tudo bem?' });
  });
  it('recusa vazio e texto longo demais', () => {
    expect(checkWebchatMessage('   ')).toEqual({ ok: false, error: 'Escreva uma mensagem antes de enviar.' });
    expect(checkWebchatMessage('a'.repeat(2001)).ok).toBe(false);
    expect(checkWebchatMessage(123 as never)).toEqual({ ok: false, error: 'Escreva uma mensagem antes de enviar.' });
  });
});

describe('nome e saudação do widget', () => {
  it('exige nome e limita o tamanho', () => {
    expect(checkDisplayName('')).toBe('Informe um nome para o widget.');
    expect(checkDisplayName('  ')).toBe('Informe um nome para o widget.');
    expect(checkDisplayName('Atendimento')).toBeNull();
    expect(checkDisplayName('a'.repeat(61))).not.toBeNull();
  });
  it('limita a saudação, mas aceita vazia', () => {
    expect(checkGreeting('')).toBeNull();
    expect(checkGreeting('a'.repeat(301))).not.toBeNull();
  });
});

describe('código de incorporação', () => {
  it('monta a tag de script com a chave e o domínio do TendiDesk', () => {
    expect(buildWebchatEmbedSnippet('0123456789abcdef0123456789abcdef', 'https://app.tendi.com.br'))
      .toBe('<script src="https://app.tendi.com.br/webchat.js" data-tendi-key="0123456789abcdef0123456789abcdef" async></script>');
  });
});

describe('CORS do widget', () => {
  it('libera qualquer origem para as rotas públicas', () => {
    expect(WEBCHAT_CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    expect(WEBCHAT_CORS_HEADERS['Access-Control-Allow-Methods']).toContain('POST');
  });
});

describe('limite de mensagens do visitante', () => {
  it('bloqueia a partir de 20 mensagens na janela', () => {
    expect(tooManyWebchatMessages(19)).toBe(false);
    expect(tooManyWebchatMessages(20)).toBe(true);
    expect(tooManyWebchatMessages(50)).toBe(true);
  });
});
