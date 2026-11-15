import { describe, expect, it } from 'vitest';
import { checkVisitorIdentity, DEFAULT_WEBCHAT_SETTINGS, normalizeVisitorPhone, normalizeWebchatSettings, queueLabel, webchatState } from './webchat-config';

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

describe('formulário de identificação do chat', () => {
  const form = DEFAULT_WEBCHAT_SETTINGS.form;

  it('padrão: nome e WhatsApp obrigatórios, e-mail opcional', () => {
    expect(form).toMatchObject({ enabled: true, phone: 'required', email: 'optional' });
    expect(checkVisitorIdentity({ name: '  Isabelly   Oliveira ', phone: '(85) 99637-0627' }, form))
      .toEqual({ ok: true, identity: { name: 'Isabelly Oliveira', phone: '+5585996370627', email: null } });
  });

  it('valida nome, telefone e e-mail', () => {
    expect(checkVisitorIdentity({ name: 'A', phone: '85996370627' }, form)).toEqual({ ok: false, error: 'Informe seu nome.' });
    expect(checkVisitorIdentity({ name: 'Ana', phone: '' }, form)).toEqual({ ok: false, error: 'Informe seu WhatsApp com DDD.' });
    expect(checkVisitorIdentity({ name: 'Ana', phone: '1234' }, form).ok).toBe(false);
    expect(checkVisitorIdentity({ name: 'Ana', phone: '85996370627', email: 'ana@' }, form)).toEqual({ ok: false, error: 'E-mail inválido.' });
    expect(checkVisitorIdentity({ name: 'Ana', phone: '85996370627', email: 'Ana@Loja.com.br' }, form))
      .toEqual({ ok: true, identity: { name: 'Ana', phone: '+5585996370627', email: 'ana@loja.com.br' } });
  });

  it('respeita o que a empresa escolheu pedir', () => {
    const onlyName = normalizeWebchatSettings({ form: { phone: 'hidden', email: 'hidden' } }).form;
    expect(checkVisitorIdentity({ name: 'Ana', phone: 'lixo', email: 'lixo' }, onlyName)).toEqual({ ok: true, identity: { name: 'Ana', phone: null, email: null } });
    const emailRequired = normalizeWebchatSettings({ form: { phone: 'optional', email: 'required' } }).form;
    expect(checkVisitorIdentity({ name: 'Ana' }, emailRequired)).toEqual({ ok: false, error: 'Informe seu e-mail.' });
    expect(normalizeWebchatSettings({ form: { phone: 'qualquer' } }).form.phone).toBe('required');
  });

  it('telefone com DDI', () => {
    expect(normalizeVisitorPhone('+55 (85) 99637-0627')).toBe('+5585996370627');
    expect(normalizeVisitorPhone('8533334444')).toBe('+558533334444');
    expect(normalizeVisitorPhone('99999')).toBeNull();
  });
});
