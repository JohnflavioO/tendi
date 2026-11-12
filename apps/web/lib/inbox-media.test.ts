import { describe, expect, it } from 'vitest';
import { downloadFilename, isFetchableMediaUrl, isViewableImage, resolveMediaSource, sniffImageMime } from './inbox-media';

describe('origem da mídia', () => {
  it('usa o link externo das mensagens recebidas', () => {
    const source = resolveMediaSource({ message_type: 'image', payload: { media_url: 'https://cdn.exemplo.com/a.jpg', mimetype: 'Image/JPEG; q=1', filename: 'foto.jpg' } });
    expect(source).toEqual({ kind: 'image', url: 'https://cdn.exemplo.com/a.jpg', storagePath: null, mimetype: 'image/jpeg', filename: 'foto.jpg' });
  });

  it('usa o Storage das mensagens enviadas pela equipe', () => {
    const source = resolveMediaSource({ message_type: 'image', payload: { media: { path: 'org/conv/x-foto.png', mimetype: 'image/png', filename: 'foto.png' } } });
    expect(source).toEqual({ kind: 'image', url: null, storagePath: 'org/conv/x-foto.png', mimetype: 'image/png', filename: 'foto.png' });
  });

  it('ignora link que não é http(s)', () => {
    const source = resolveMediaSource({ message_type: 'image', payload: { media_url: 'javascript:alert(1)' } });
    expect(source?.url).toBeNull();
    expect(source?.storagePath).toBeNull();
  });

  it('retorna null para mensagem de texto e aceita payload vazio', () => {
    expect(resolveMediaSource({ message_type: 'text', payload: {} })).toBeNull();
    expect(resolveMediaSource({ message_type: 'image', payload: null })).toMatchObject({ kind: 'image', url: null, storagePath: null });
  });
});

describe('nome do arquivo ao baixar', () => {
  it('mantém o nome original, sem caminho nem caracteres inválidos', () => {
    expect(downloadFilename({ kind: 'document', filename: 'C:\\temp\\contrato "final".pdf' })).toBe('contrato final.pdf');
  });

  it('gera um nome com data e extensão pelo tipo', () => {
    expect(downloadFilename({ kind: 'image', mimetype: 'image/png', createdAt: '2026-11-12T09:09:30Z' })).toBe('imagem-2026-11-12-0909.png');
    expect(downloadFilename({ kind: 'image', createdAt: '2026-11-12T09:09:30Z' })).toBe('imagem-2026-11-12-0909.jpg');
    expect(downloadFilename({ kind: 'sticker' })).toBe('figurinha.webp');
  });
});

describe('links que o servidor pode buscar', () => {
  it.each(['https://cdn.exemplo.com/a.jpg', 'https://media.d-api.cloud/files/1?token=abc', 'https://exemplo.com:443/a.jpg'])('aceita %s', url => {
    expect(isFetchableMediaUrl(url)).toBe(true);
  });

  it.each([
    'http://cdn.exemplo.com/a.jpg',
    'https://localhost/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://10.0.0.5/a.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.jpg',
    'https://servidor/a.jpg',
    'https://banco.internal/a.jpg',
    'https://impressora.local/a.jpg',
    'https://exemplo.com:8443/a.jpg',
    'https://user:senha@exemplo.com/a.jpg',
    'ftp://exemplo.com/a.jpg',
    'javascript:alert(1)',
    '',
    null,
  ])('recusa %s', url => {
    expect(isFetchableMediaUrl(url)).toBe(false);
  });
});

describe('tipo da imagem pelo conteúdo', () => {
  const bytes = (...values: number[]) => new Uint8Array(values).buffer;
  it('reconhece JPEG, PNG e WebP', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe('image/png');
    expect(sniffImageMime(new TextEncoder().encode('RIFF\u0001\u0002\u0003\u0004WEBPVP8 ').buffer as ArrayBuffer)).toBe('image/webp');
  });
  it('não reconhece outros arquivos', () => {
    expect(sniffImageMime(new TextEncoder().encode('%PDF-1.7 conteudo').buffer as ArrayBuffer)).toBeNull();
    expect(sniffImageMime(bytes())).toBeNull();
  });
});

describe('imagens do visualizador', () => {
  it('abre fotos e figurinhas, não áudio nem texto', () => {
    expect(isViewableImage({ message_type: 'image', payload: {} })).toBe(true);
    expect(isViewableImage({ message_type: 'sticker', payload: {} })).toBe(true);
    expect(isViewableImage({ message_type: 'audio', payload: {} })).toBe(false);
    expect(isViewableImage({ message_type: 'text', payload: {} })).toBe(false);
  });
});
