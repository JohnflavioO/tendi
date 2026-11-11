import { describe, expect, it } from 'vitest';
import { conversationTags, inboxTabOf, relativeTime, tagTone, TAG_TONES } from './inbox-utils';
import { AVATAR_TTL_MS, avatarIsFresh, pickAvatarUrl } from './contact-avatar';
import { nextRate } from '../components/inbox/audio-player';

describe('tempo relativo', () => {
  const now = new Date('2026-11-15T15:00:00Z');
  it('formata minutos, horas, ontem e datas', () => {
    expect(relativeTime('2026-11-15T14:59:40Z', now)).toBe('agora');
    expect(relativeTime('2026-11-15T14:45:00Z', now)).toBe('há 15 min');
    expect(relativeTime('2026-11-15T12:00:00Z', now)).toBe('há 3 h');
    expect(relativeTime('2026-11-14T10:00:00Z', now)).toBe('ontem');
    expect(relativeTime('2026-11-11T10:00:00Z', now)).toBe('há 4 dias');
    expect(relativeTime('2026-10-01T10:00:00Z', now)).toBe('01/10');
    expect(relativeTime(null, now)).toBe('');
  });
});

describe('abas e etiquetas', () => {
  it('Novos, Meus e Outros; encerradas ficam fora das abas', () => {
    expect(inboxTabOf({ assigned_to: null, status: 'open' }, 'u1')).toBe('novos');
    expect(inboxTabOf({ assigned_to: 'u1', status: 'pending' }, 'u1')).toBe('meus');
    expect(inboxTabOf({ assigned_to: 'u2', status: 'open' }, 'u1')).toBe('outros');
    expect(inboxTabOf({ assigned_to: null, status: 'closed' }, 'u1')).toBeNull();
  });

  it('cor da etiqueta é estável e ignora maiúsculas', () => {
    expect(tagTone('Suporte')).toBe(tagTone('suporte '));
    expect(TAG_TONES).toContain(tagTone('Prioridade'));
  });

  it('fluxo da IA vem antes das etiquetas do contato', () => {
    expect(conversationTags({ aiMode: 'on', contactTags: ['VIP', ' '] }).map(tag => tag.label)).toEqual(['Fluxo IA', 'VIP']);
    expect(conversationTags({ aiMode: 'handoff', contactTags: [] }).map(tag => tag.label)).toEqual(['Aguardando atendente']);
    expect(conversationTags({ aiMode: 'off', contactTags: null })).toEqual([]);
  });
});

describe('foto de perfil', () => {
  it('encontra o link nos formatos mais comuns da resposta', () => {
    expect(pickAvatarUrl({ url: 'https://pps.whatsapp.net/a.jpg' })).toBe('https://pps.whatsapp.net/a.jpg');
    expect(pickAvatarUrl({ data: { profilePictureUrl: 'https://pps.whatsapp.net/b.jpg' } })).toBe('https://pps.whatsapp.net/b.jpg');
    expect(pickAvatarUrl({ success: true, avatar: { eurl: 'https://x.com/c.jpg' } })).toBe('https://x.com/c.jpg');
    expect(pickAvatarUrl('https://x.com/d.jpg')).toBe('https://x.com/d.jpg');
    expect(pickAvatarUrl({ url: 'javascript:alert(1)' })).toBeNull();
    expect(pickAvatarUrl({ success: true })).toBeNull();
  });

  it('reaproveita a foto por alguns dias', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(avatarIsFresh(new Date(now.getTime() - AVATAR_TTL_MS + 60_000).toISOString(), now)).toBe(true);
    expect(avatarIsFresh(new Date(now.getTime() - AVATAR_TTL_MS - 60_000).toISOString(), now)).toBe(false);
    expect(avatarIsFresh(null, now)).toBe(false);
  });
});

describe('velocidade do áudio', () => {
  it('1x → 1,5x → 2x → 1x', () => {
    expect(nextRate(1)).toBe(1.5);
    expect(nextRate(1.5)).toBe(2);
    expect(nextRate(2)).toBe(1);
    expect(nextRate(3)).toBe(1);
  });
});
