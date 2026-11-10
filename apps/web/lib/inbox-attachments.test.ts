import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES, buildDapiMediaRequest, buildStoragePath, checkFileBeforeUpload,
  kindFromMime, normalizeMime, sanitizeFilename, validateAttachment,
} from './inbox-attachments';

const ORG = '11111111-1111-1111-1111-111111111111';
const CONV = '22222222-2222-2222-2222-222222222222';
const base = { path: `${ORG}/${CONV}/abc-foto.jpg`, mimetype: 'image/jpeg', filename: 'foto.jpg', size: 1000 };

describe('tipos', () => {
  it('normaliza e classifica o mimetype', () => {
    expect(normalizeMime('Audio/OGG; codecs=opus')).toBe('audio/ogg');
    expect(kindFromMime('audio/ogg;codecs=opus')).toBe('audio');
    expect(kindFromMime('image/png')).toBe('image');
    expect(kindFromMime('video/mp4')).toBe('video');
    expect(kindFromMime('application/pdf')).toBe('document');
    expect(kindFromMime('application/x-msdownload')).toBeNull();
    expect(kindFromMime('audio/webm')).toBeNull(); // webm não toca no WhatsApp
    expect(kindFromMime('')).toBeNull();
    expect(ALLOWED_MIME_TYPES).not.toContain('text/html');
    expect(ALLOWED_MIME_TYPES).not.toContain('image/svg+xml');
  });
});

describe('sanitizeFilename / buildStoragePath', () => {
  it('remove caminhos e símbolos, mantém acentos e extensão', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\Relatório final (v2).pdf')).toBe('Relatório final (v2).pdf');
    expect(sanitizeFilename('a<b>c|d?.png')).toBe('a_b_c_d_.png');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('')).toBe('arquivo');
    expect(sanitizeFilename('x'.repeat(300) + '.pdf')).toHaveLength(120);
    expect(sanitizeFilename('x'.repeat(300) + '.pdf').endsWith('.pdf')).toBe(true);
  });
  it('monta o caminho dentro da pasta da empresa e da conversa', () => {
    expect(buildStoragePath(ORG, CONV, 'a b.pdf', 'id1')).toBe(`${ORG}/${CONV}/id1-a b.pdf`);
  });
});

describe('checkFileBeforeUpload', () => {
  it('recusa vazio, grande demais e tipo não suportado', () => {
    expect(checkFileBeforeUpload({ type: 'image/png', size: 10 })).toBeNull();
    expect(checkFileBeforeUpload({ type: 'image/png', size: 0 })).toMatch(/vazio/);
    expect(checkFileBeforeUpload({ type: 'video/mp4', size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/16 MB/);
    expect(checkFileBeforeUpload({ type: 'application/x-msdownload', size: 10 })).toMatch(/não suportado/);
  });
});

describe('validateAttachment', () => {
  it('aceita um anexo válido', () => {
    const r = validateAttachment(base, ORG, CONV);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ kind: 'image', mimetype: 'image/jpeg', filename: 'foto.jpg', voice: false });
  });
  it('recusa caminho de outra empresa, de outra conversa, com .. ou fora do formato', () => {
    const bad = (path: string) => validateAttachment({ ...base, path }, ORG, CONV);
    expect(bad(`${'9'.repeat(8)}-9999-9999-9999-${'9'.repeat(12)}/${CONV}/x.jpg`).ok).toBe(false);
    expect(bad(`${ORG}/${'9'.repeat(8)}-9999-9999-9999-${'9'.repeat(12)}/x.jpg`).ok).toBe(false);
    expect(bad(`${ORG}/${CONV}/../${CONV}/x.jpg`).ok).toBe(false);
    expect(bad(`${ORG}/${CONV}/`).ok).toBe(false);
    expect(bad(`/${ORG}/${CONV}/x.jpg`).ok).toBe(false);
    expect(bad(`${ORG}/${CONV}/a\\b.jpg`).ok).toBe(false);
  });
  it('recusa tipo, tamanho e formato inválidos', () => {
    expect(validateAttachment({ ...base, mimetype: 'application/x-sh' }, ORG, CONV).ok).toBe(false);
    expect(validateAttachment({ ...base, size: 0 }, ORG, CONV).ok).toBe(false);
    expect(validateAttachment({ ...base, size: MAX_ATTACHMENT_BYTES + 1 }, ORG, CONV).ok).toBe(false);
    expect(validateAttachment({ ...base, size: '10' }, ORG, CONV).ok).toBe(false);
    expect(validateAttachment(null, ORG, CONV).ok).toBe(false);
    expect(validateAttachment([], ORG, CONV).ok).toBe(false);
  });
  it('nota de voz só vale para áudio ogg', () => {
    const audio = (mimetype: string) => validateAttachment({ path: `${ORG}/${CONV}/v.ogg`, mimetype, filename: 'v.ogg', size: 10, voice: true }, ORG, CONV);
    const ogg = audio('audio/ogg;codecs=opus'); expect(ogg.ok && ogg.value.voice).toBe(true);
    const mp3 = audio('audio/mpeg'); expect(mp3.ok && mp3.value.voice).toBe(false);
    const img = validateAttachment({ ...base, voice: true }, ORG, CONV); expect(img.ok && img.value.voice).toBe(false);
  });
});

describe('buildDapiMediaRequest', () => {
  const ctx = { sessionId: 's1', to: '5511999990000', url: 'https://signed/x', caption: 'legenda' };
  const make = (over: object) => { const r = validateAttachment({ ...base, ...over }, ORG, CONV); if (!r.ok) throw new Error(r.error); return r.value; };
  it('monta cada tipo com os campos da D-API', () => {
    expect(buildDapiMediaRequest(make({}), ctx)).toEqual({ path: '/messages/send/image', body: { sessionId: 's1', to: '5511999990000', image: 'https://signed/x', caption: 'legenda' } });
    expect(buildDapiMediaRequest(make({ mimetype: 'video/mp4' }), ctx)).toEqual({ path: '/messages/send/video', body: { sessionId: 's1', to: '5511999990000', video: 'https://signed/x', caption: 'legenda' } });
    expect(buildDapiMediaRequest(make({ mimetype: 'application/pdf', filename: 'proposta.pdf' }), ctx)).toEqual({ path: '/messages/send/document', body: { sessionId: 's1', to: '5511999990000', document: 'https://signed/x', fileName: 'proposta.pdf', mimetype: 'application/pdf', caption: 'legenda' } });
    expect(buildDapiMediaRequest(make({ mimetype: 'audio/ogg', voice: true }), { ...ctx, caption: null })).toEqual({ path: '/messages/send/audio', body: { sessionId: 's1', to: '5511999990000', audio: 'https://signed/x', ptt: true } });
    expect(buildDapiMediaRequest(make({ mimetype: 'audio/mpeg' }), { ...ctx, caption: null }).body.ptt).toBe(false);
  });
  it('sem legenda não envia o campo caption', () => {
    expect('caption' in buildDapiMediaRequest(make({}), { ...ctx, caption: null }).body).toBe(false);
  });
});
