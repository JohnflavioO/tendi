import { Globe, Instagram } from 'lucide-react';
import { CHANNEL_INFO, isChannelKey } from '@/lib/channels';

const WHATSAPP_PATH = 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1a12 12 0 0 1-1.5-.6 11.7 11.7 0 0 1-4.5-4c-.3-.5-.9-1.6-.9-2.7a3 3 0 0 1 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.4.2.5.3 0 .2 0 .8-.2 1.3Z';
const MESSENGER_PATH = 'M12 2C6.4 2 2 6.1 2 11.7c0 2.9 1.2 5.5 3.2 7.2v3.5l3-1.7c1.2.3 2.5.5 3.8.5 5.6 0 10-4.1 10-9.6S17.6 2 12 2Zm1 12.9-2.5-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.5 5.8Z';

/** Ícone redondo do canal da conversa (WhatsApp, Instagram, Messenger ou chat do site). */
export function ChannelBadge({ channel, className = 'size-[18px]' }: { channel: string | null | undefined; className?: string }) {
  if (!isChannelKey(channel)) return null;
  const { label, color } = CHANNEL_INFO[channel];
  const background = channel === 'instagram' ? 'linear-gradient(45deg,#F9A825 0%,#E1306C 50%,#833AB4 100%)' : color;
  return <span role="img" aria-label={label} title={label} className={`flex shrink-0 items-center justify-center rounded-full text-white ${className}`} style={{ background }}>
    {channel === 'whatsapp' && <svg viewBox="0 0 24 24" className="size-[58%] fill-current" aria-hidden><path d={WHATSAPP_PATH} /></svg>}
    {channel === 'messenger' && <svg viewBox="0 0 24 24" className="size-[60%] fill-current" aria-hidden><path d={MESSENGER_PATH} /></svg>}
    {channel === 'instagram' && <Instagram className="size-[60%]" strokeWidth={2.4} aria-hidden />}
    {channel === 'webchat' && <Globe className="size-[60%]" strokeWidth={2.4} aria-hidden />}
  </span>;
}
