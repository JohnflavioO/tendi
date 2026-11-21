'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CompleteInvitePage() {
  const [message, setMessage] = useState('Validando seu convite...');
  useEffect(() => {
    let cancelled = false;
    async function finish() {
      try {
        const supabase = createClient();
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = fragment.get('access_token');
        const refreshToken = fragment.get('refresh_token');
        const fragmentError = fragment.get('error_description') || fragment.get('error');
        if (fragmentError || !accessToken || !refreshToken) throw new Error('link');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          window.history.replaceState(null, '', '/auth/complete');
        }
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error('link');
        const response = await fetch('/api/team/activate-invite', { method: 'POST' });
        if (!response.ok) throw new Error('activation');
        const result = await response.json();
        if (cancelled) return;
        window.location.replace(result.needsPassword ? '/definir-senha' : '/inbox');
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error && error.message === 'activation'
          ? 'Não foi possível ativar o convite. Entre em contato com o administrador.'
          : 'O link do convite expirou ou já foi utilizado. Peça um novo convite à empresa.');
      }
    }
    void finish();
    return () => { cancelled = true; };
  }, []);
  return <main className="flex min-h-screen items-center justify-center bg-[#F5F6FB] p-6">
    <div role="status" className="max-w-md rounded-2xl bg-white p-8 text-center text-slate-700 shadow-sm">
      <h1 className="mb-3 text-xl font-bold text-[#25275B]">Bem-vindo ao TendiDesk</h1>
      <p>{message}</p>
    </div>
  </main>;
}
