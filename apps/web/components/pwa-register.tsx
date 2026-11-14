'use client';

import { useEffect } from 'react';

/** Registra o service worker do app instalável. Só em produção: no desenvolvimento ele atrapalharia o recarregamento. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
