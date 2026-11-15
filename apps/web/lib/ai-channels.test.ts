import { describe, expect, it } from 'vitest';
import { agentAiChannels, agentChannelEnabled } from './ai-agent';
import { channelLabel } from './channels';

describe('IA por canal', () => {
  it('sem a coluna (antes da migração) vale para todos os canais com IA', () => {
    expect(agentAiChannels(undefined)).toEqual(['whatsapp', 'webchat', 'instagram']);
    expect(agentChannelEnabled(undefined, 'instagram')).toBe(true);
  });

  it('respeita os canais marcados e ignora valores desconhecidos', () => {
    expect(agentAiChannels(['instagram', 'telegram'])).toEqual(['instagram']);
    expect(agentChannelEnabled(['whatsapp'], 'instagram')).toBe(false);
    expect(agentChannelEnabled(['whatsapp'], 'whatsapp')).toBe(true);
  });

  it('Messenger nunca tem IA, mesmo marcado', () => {
    expect(agentChannelEnabled(['whatsapp', 'messenger'], 'messenger')).toBe(false);
  });

  it('nomeia os canais para a tela', () => {
    expect(channelLabel('webchat')).toBe('Chat do site');
    expect(channelLabel('instagram')).toBe('Instagram');
    expect(channelLabel('outro')).toBe('outro');
  });
});
