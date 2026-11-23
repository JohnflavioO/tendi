'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, AlertTriangle } from 'lucide-react';
import { FIREBASE_WEB_CONFIG, FIREBASE_WEB_PUSH_VAPID_KEY } from '@/lib/firebase-public-config';

type PushState = 'idle' | 'loading' | 'ready' | 'error';

export function EnablePushButton({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<PushState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setMessage('Permissão concedida neste aparelho. Toque em Verificar e ativar para atualizar o cadastro do dispositivo.');
    }
  }, []);

  async function testPush() {
    setMessage('');
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'Falha ao enviar teste.');
      setMessage(result.message || 'Teste enviado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar teste.');
    }
  }

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
      setMessage('Notificações ativadas e dispositivo atualizado. Use o botão abaixo para enviar um teste.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    }
  }

  return <div className="border-b border-tendi-line bg-indigo-50/70 px-4 py-4">
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-tendi-indigo"><BellRing size={22}/></span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-tendi-navy">Notificações no celular</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">Receba lembretes mesmo com o TendiDesk fechado. Ative e teste neste aparelho.</p>
      </div>
    </div>
    <button type="button" onClick={() => void enable()} disabled={state === 'loading'}
      className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-tendi-indigo px-4 text-base font-semibold text-white shadow-sm disabled:opacity-60">
      {state === 'ready' ? <CheckCircle2 size={19}/> : <BellRing size={19}/>}
      {state === 'loading' ? 'Verificando...' : state === 'ready' ? 'Notificações ativadas — atualizar' : 'Verificar e ativar notificações'}
    </button>
    <button type="button" onClick={() => void testPush()} disabled={state === 'loading'}
      className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-tendi-indigo/30 bg-white px-4 text-sm font-semibold text-tendi-indigo">
      Enviar notificação de teste
    </button>
    {message && <p role="status" className={`mt-3 flex items-start gap-2 rounded-lg bg-white p-3 text-sm leading-relaxed ${state === 'error' ? 'text-red-700' : 'text-slate-700'}`}>
      {state === 'error' && <AlertTriangle size={18} className="shrink-0"/>}{message}
    </p>}
    <p className="mt-2 text-sm text-slate-600">No iPhone, use o TendiDesk instalado na Tela de Início e permita as notificações nas configurações do iOS.</p>
  </div>;
}
