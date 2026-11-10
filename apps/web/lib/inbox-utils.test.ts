import { describe, expect, it } from 'vitest';
import { MAX_TAGS, addTag, mediaKind, mergeMessages, previewText, safeMediaUrl, statusLabel } from './inbox-utils';

describe('mergeMessages', () => {
  it('junta sem duplicar, a lista mais nova prevalece, e ordena por data', () => {
    const a = [{ id: '1', created_at: '2026-11-10T10:00:00Z', body: 'velha' }, { id: '2', created_at: '2026-11-10T10:05:00Z', body: 'b' }];
    const b = [{ id: '1', created_at: '2026-11-10T10:00:00Z', body: 'atualizada' }, { id: '0', created_at: '2026-11-10T09:00:00Z', body: 'a' }];
    const merged = mergeMessages(a, b);
    expect(merged.map(m => m.id)).toEqual(['0', '1', '2']);
    expect(merged[1].body).toBe('atualizada');
  });
  it('desempata datas iguais pelo id (ordem estável)', () => {
    const merged = mergeMessages([{ id: 'b', created_at: 'T' }, { id: 'a', created_at: 'T' }]);
    expect(merged.map(m => m.id)).toEqual(['a', 'b']);
  });
});

describe('safeMediaUrl', () => {
  it('aceita só http e https', () => {
    expect(safeMediaUrl('https://cdn.exemplo.com/a.jpg?x=1')).toBe('https://cdn.exemplo.com/a.jpg?x=1');
    expect(safeMediaUrl('http://exemplo.com/a.mp3')).toBe('http://exemplo.com/a.mp3');
    expect(safeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(safeMediaUrl('data:text/html;base64,AAAA')).toBeNull();
    expect(safeMediaUrl('//exemplo.com/x')).toBeNull();
    expect(safeMediaUrl('')).toBeNull();
    expect(safeMediaUrl(null)).toBeNull();
    expect(safeMediaUrl(42)).toBeNull();
  });
});

describe('previewText / mediaKind', () => {
  it('usa o texto, ou um rótulo para mídia sem legenda, ou o canal', () => {
    expect(previewText({ body: 'Olá', message_type: 'text' }, 'whatsapp')).toBe('Olá');
    expect(previewText({ body: null, message_type: 'image' }, 'whatsapp')).toBe('📷 Imagem');
    expect(previewText({ body: '  ', message_type: 'audio' }, 'whatsapp')).toBe('🎧 Áudio');
    expect(previewText({ body: null, message_type: 'text' }, 'whatsapp')).toBe('whatsapp');
    expect(previewText(undefined, 'whatsapp')).toBe('whatsapp');
    expect(mediaKind('document')).toBe('document');
    expect(mediaKind('text')).toBeNull();
  });
});

describe('addTag', () => {
  it('adiciona, limpa espaços e vírgulas, e ignora vazio', () => {
    expect(addTag([], '  cliente   vip ').tags).toEqual(['cliente vip']);
    expect(addTag(['a'], 'b, c').tags).toEqual(['a', 'b c']);
    expect(addTag(['a'], '   ').tags).toEqual(['a']);
  });
  it('recusa duplicada (sem diferenciar maiúsculas), etiqueta longa e excesso', () => {
    expect(addTag(['VIP'], 'vip').error).toMatch(/já existe/);
    expect(addTag([], 'x'.repeat(31)).error).toMatch(/até 30/);
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, 'nova').error).toMatch(/Limite/);
  });
});

describe('statusLabel', () => {
  it('traduz o status da conversa', () => {
    expect(statusLabel('open')).toBe('Atendimento em andamento');
    expect(statusLabel('closed')).toBe('Encerrada');
    expect(statusLabel('qualquer')).toBe('qualquer');
  });
});
