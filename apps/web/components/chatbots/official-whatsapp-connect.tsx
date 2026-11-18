'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { META_SDK_VERSION, parseSignupMessage, signupLoginOptions, signupRequestBody, type SignupResult } from '@/lib/meta-embedded-signup';

type FacebookSdk = {
  init(options: Record<string, unknown>): void;
  login(callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>): void;
};
declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void }
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
const CONFIG_ID = process.env.NEXT_PUBLIC_META_SIGNUP_CONFIG_ID ?? '';

/** O cadastro incorporado só aparece quando o app da Meta está configurado neste deploy. */
export const officialSignupAvailable = Boolean(APP_ID && CONFIG_ID);

let sdkPromise: Promise<FacebookSdk> | null = null;

/** Carrega o SDK de JavaScript da Meta uma vez, só quando o botão é usado. */
function loadFacebookSdk(): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  sdkPromise ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      if (!window.FB) { reject(new Error('SDK da Meta indisponível.')); return; }
      window.FB.init({ appId: APP_ID, autoLogAppEvents: false, xfbml: false, version: META_SDK_VERSION });
      resolve(window.FB);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => { sdkPromise = null; reject(new Error('Não foi possível carregar a janela da Meta. Verifique bloqueadores de anúncio.')); };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

/**
 * Botão "Conectar WhatsApp oficial": abre o cadastro da Meta, em que o cliente
 * entra com o Facebook, escolhe a empresa e o número. Ao terminar, o servidor
 * conclui no On Connect. Se o workspace usa QR Code, pede confirmação antes.
 */
export function OfficialWhatsappConnect({ organizationId, replacesQr, onConnected, onError }: {
  organizationId: string;
  replacesQr: boolean;
  onConnected: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const finish = useRef<SignupResult | null>(null);

  // A janela da Meta informa a conta e o número por mensagem.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const result = parseSignupMessage(event.origin, event.data);
      if (result) finish.current = result;
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  async function complete(code: string) {
    // A mensagem de fim da janela pode chegar logo depois da resposta do login.
    for (let waited = 0; !finish.current && waited < 3000; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const result = finish.current;
    if (!result || result.kind !== 'finish') {
      onError(result?.kind === 'error' ? result.message : 'O cadastro na Meta não foi concluído. Tente de novo e clique em Concluir no final.');
      return;
    }
    const response = await fetch(`/api/whatsapp/meta-signup?organizationId=${encodeURIComponent(organizationId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupRequestBody(code, result)),
      cache: 'no-store',
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      onError(typeof payload.error === 'string' ? payload.error : 'Não foi possível concluir a conexão com a Meta.');
      return;
    }
    await onConnected();
  }

  async function start() {
    if (replacesQr && !window.confirm('Conectar o WhatsApp oficial vai desconectar o número que está ligado por QR Code neste workspace. As conversas continuam no Inbox. Continuar?')) return;
    setBusy(true);
    finish.current = null;
    try {
      const FB = await loadFacebookSdk();
      await new Promise<void>((resolve) => {
        FB.login((response) => {
          const code = response.authResponse?.code;
          if (!code) {
            if (finish.current?.kind === 'error') onError(finish.current.message);
            resolve();
            return;
          }
          void complete(code).finally(resolve);
        }, signupLoginOptions(CONFIG_ID));
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível abrir a janela da Meta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => void start()} disabled={busy || !organizationId}
      className="inline-flex items-center gap-2 rounded-xl border border-[#16834C]/30 bg-[#E8F6EF] px-4 py-3 text-xs font-semibold text-[#16834C] hover:bg-[#d6efe2] disabled:opacity-50">
      {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
      Conectar WhatsApp oficial
    </button>
  );
}
