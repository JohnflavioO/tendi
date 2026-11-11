'use client';

import { useEffect, useState } from 'react';

const initials = (name?: string | null) => (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';

// Contatos sem foto pública: lembra durante a sessão para não pedir de novo a cada renderização.
const missing = new Set<string>();

/** Foto de perfil do WhatsApp do contato, com as iniciais enquanto carrega ou quando não há foto. */
export function ContactAvatar({ contactId, name, className = 'size-11 rounded-2xl text-xs', whatsapp = false }: {
  contactId?: string | null;
  name?: string | null;
  className?: string;
  whatsapp?: boolean;
}) {
  const [failed, setFailed] = useState(() => !contactId || missing.has(contactId));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(!contactId || missing.has(contactId)); setLoaded(false); }, [contactId]);

  return <span className={`relative flex shrink-0 items-center justify-center bg-gradient-to-br from-[#DFE1F7] to-[#F7DDEF] font-bold text-[#25275B] ${className}`}>
    {!loaded && initials(name)}
    {contactId && !failed && <img
      src={`/api/contacts/${contactId}/avatar`}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => { missing.add(contactId); setFailed(true); }}
      className={`absolute inset-0 size-full object-cover ${className.split(' ').filter(c => c.startsWith('rounded')).join(' ')} ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />}
    {whatsapp && <span aria-label="WhatsApp" className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-white bg-[#25D366] text-white">
      <svg viewBox="0 0 24 24" className="size-2.5 fill-current" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1a12 12 0 0 1-1.5-.6 11.7 11.7 0 0 1-4.5-4c-.3-.5-.9-1.6-.9-2.7a3 3 0 0 1 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.4.2.5.3 0 .2 0 .8-.2 1.3Z"/></svg>
    </span>}
  </span>;
}
