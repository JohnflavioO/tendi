'use client';

import { useEffect, useState } from 'react';
import { ChannelBadge } from '@/components/inbox/channel-badge';

const initials = (name?: string | null) => (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';

// Contatos sem foto pública: lembra durante a sessão para não pedir de novo a cada renderização.
const missing = new Set<string>();

/**
 * Foto de perfil do WhatsApp do contato, com as iniciais enquanto carrega ou quando não há foto.
 * `channel` mostra no canto o ícone do canal da conversa (`whatsapp` = atalho para o WhatsApp).
 */
export function ContactAvatar({ contactId, name, className = 'size-11 rounded-2xl text-xs', whatsapp = false, channel }: {
  contactId?: string | null;
  name?: string | null;
  className?: string;
  whatsapp?: boolean;
  channel?: string | null;
}) {
  const badge = channel ?? (whatsapp ? 'whatsapp' : null);
  const [failed, setFailed] = useState(() => !contactId || missing.has(contactId));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(!contactId || missing.has(contactId)); setLoaded(false); }, [contactId]);

  return <span className={`relative flex shrink-0 items-center justify-center bg-gradient-to-br from-[#DFE1F7] to-[#F7DDEF] font-bold text-tendi-navy ${className}`}>
    {!loaded && initials(name)}
    {contactId && !failed && <img
      src={`/api/contacts/${contactId}/avatar`}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => { missing.add(contactId); setFailed(true); }}
      className={`absolute inset-0 size-full object-cover ${className.split(' ').filter(c => c.startsWith('rounded')).join(' ')} ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />}
    {badge && <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white"><ChannelBadge channel={badge} className="size-[16px]" /></span>}
  </span>;
}
