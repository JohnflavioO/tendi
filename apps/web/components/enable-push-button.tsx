'use client';

import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { FIREBASE_WEB_CONFIG, FIREBASE_WEB_PUSH_VAPID_KEY } from '@/lib/firebase-public-config';

type PushState = 'idle' | 'loading' | 'ready' | 'error';

export function EnablePushButton({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<PushState>('idle');
  const [message, setMessage] = useState('');

  async function enable() {
    setState('loading');
    setMessage('');
    try {
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('Notification' in window)) {
        throw new Error('Este navegador não oferece suporte a notificações Web Push.');
      }
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
      if (!(await isSupported())) throw new Error('Firebase Messaging não está disponível neste navegador.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const app = getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
      const token = await getToken(getMessaging(app), {
        vapidKey: FIREBASE_WEB_PUSH_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error('Não foi possível gerar o token de notificações.');
      const response = await fetch('/api/push/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, token, platform: 'web' }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || 'Não foi possível registrar o dispositivo.');
      }
      setState('ready');
      setMessage('Dispositivo registrado para receber notificações. O envio de teste será disponibilizado em breve.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    }
  }

  return <div className="space-y-1">
    <button type="button" onClick={() => void enable()} disabled={state === 'loading' || state === 'ready'}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-tendi-indigo hover:bg-tendi-haze disabled:opacity-60">
      <BellRing size={15} />
      {state === 'loading' ? 'Ativando...' : state === 'ready' ? 'Dispositivo preparado' : 'Ativar notificações'}
    </button>
    {message && <p role="status" className={`px-3 pb-2 text-xs ${state === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{message}</p>}
  </div>;
}
