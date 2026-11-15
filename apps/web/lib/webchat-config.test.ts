import { describe, expect, it } from 'vitest';
import { DEFAULT_WEBCHAT_SETTINGS, normalizeWebchatSettings, queueLabel, webchatState } from './webchat-config';

describe('configuração dos botões do webchat', () => {
  it('sem nada salvo, usa os padrões', () => {
    expect(normalizeWebchatSettings(null)).toEqual(DEFAULT_WEBCHAT_SETTINGS);
    expect(normalizeWebchatSettings({ handoffButton: { label: '   ' } }).handoffButton.label).toBe('Falar com atendente');
  });

  it('respeita o que a empresa escolheu', () => {
    const settings = normalizeWebchatSettings({
      handoffButton: { enabled: false, label: 'Quero uma pessoa' },
      endButton: { enabled: true, label: 'Finalizar' },
      queue: { enabled: true, showPosition: false, message: 'Já já alguém fala com você.' },
      endMessage: 'Valeu!',
    });
    expect(settings.handoffButton).toEqual({ enabled: false, label: 'Quero uma pessoa' });
    expect(settings.endButton.label).toBe('Finalizar');
    expect(settings.queue).toEqual({ enabled: true, showPosition: false, message: 'Já já alguém fala com você.' });
    expect(settings.endMessage).toBe('Valeu!');
  });

  it('respostas rápidas: até 4, sem repetir, texto padrão = rótulo', () => {
    const settings = normalizeWebchatSettings({ quickReplies: [
      { label: 'Ver planos', text: 'Quero conhecer os planos' },
      { label: 'ver planos' },
      { label: 'Suporte' },
      { label: '' },
      { label: 'A' }, { label: 'B' }, { label: 'C' },
    ] });
    expect(settings.quickReplies).toEqual([
      { label: 'Ver planos', text: 'Quero conhecer os planos' },
      { label: 'Suporte', text: 'Suporte' },
      { label: 'A', text: 'A' },
      { label: 'B', text: 'B' },
    ]);
    expect(normalizeWebchatSettings({ quickReplies: [{ label: 'x'.repeat(60) }] }).quickReplies[0]!.label.length).toBe(28);
  });
});

describe('estado do atendimento para o visitante', () => {
  const settings = DEFAULT_WEBCHAT_SETTINGS;
  const base = { settings, position: 2, inHours: true, hoursText: 'seg a sex 08:00–18:00' };

  it('IA, atendente, encerrado', () => {
    expect(webchatState({ ...base, conversation: { status: 'open', ai_mode: 'on', assigned_to: null } })).toEqual({ mode: 'ai' });
    expect(webchatState({ ...base, conversation: { status: 'open', ai_mode: 'handoff', assigned_to: 'u1' } })).toEqual({ mode: 'human' });
    expect(webchatState({ ...base, conversation: { status: 'closed', ai_mode: 'off', assigned_to: null } })).toEqual({ mode: 'closed', message: settings.endMessage });
  });

  it('fila no horário mostra a posição; fora do horário avisa quando a equipe volta', () => {
    expect(webchatState({ ...base, conversation: { status: 'open', ai_mode: 'handoff', assigned_to: null } })).toEqual({ mode: 'queue', position: 2, inHours: true, message: settings.queue.message });
    const off = webchatState({ ...base, inHours: false, conversation: { status: 'open', ai_mode: 'handoff', assigned_to: null } });
    expect(off).toMatchObject({ mode: 'queue', position: null, inHours: false });
    expect(off.mode === 'queue' && off.message).toContain('seg a sex 08:00–18:00');
  });

  it('fila desligada: o visitante só conversa, sem aviso', () => {
    const noQueue = normalizeWebchatSettings({ queue: { enabled: false } });
    expect(webchatState({ ...base, settings: noQueue, conversation: { status: 'open', ai_mode: 'handoff', assigned_to: null } })).toEqual({ mode: 'human' });
  });

  it('texto da posição', () => {
    expect(queueLabel(1)).toBe('Você é o próximo a ser atendido');
    expect(queueLabel(3)).toBe('Você é o 3º na fila');
    expect(queueLabel(null)).toBe('Você está na fila de atendimento');
  });
});
