/** Canais de atendimento: nome e cor de cada um, para o Inbox e as configurações. */
export type ChannelKey = 'whatsapp' | 'instagram' | 'messenger' | 'webchat';

export const CHANNEL_ORDER: ChannelKey[] = ['whatsapp', 'instagram', 'messenger', 'webchat'];

export const CHANNEL_INFO: Record<ChannelKey, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  messenger: { label: 'Messenger', color: '#0A7CFF' },
  webchat: { label: 'Chat do site', color: '#3E3A8C' },
};

export const isChannelKey = (value: unknown): value is ChannelKey => typeof value === 'string' && value in CHANNEL_INFO;

/** Nome do canal para a tela; um canal desconhecido aparece como veio. */
export const channelLabel = (channel: string | null | undefined): string =>
  isChannelKey(channel) ? CHANNEL_INFO[channel].label : (channel ?? '');
