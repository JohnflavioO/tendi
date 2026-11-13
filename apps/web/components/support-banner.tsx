'use client';

import { useEffect, useState } from 'react';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Faixa exibida para o Super Admin enquanto ele está dentro da empresa de um cliente com acesso
 * de suporte liberado. Mostra a empresa, o prazo e o botão para encerrar o acesso.
 */
export function SupportBanner({ organizationId, organizationName, supportUntil }: {
  organizationId: string;
  organizationName: string;
  supportUntil: string | null;
}) {
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!supportUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [supportUntil]);

  // Prazo acabou com a tela aberta: o banco já bloqueia os dados; volta para o Console.
  const expired = supportUntil ? Date.parse(supportUntil) <= now : false;
  useEffect(() => { if (expired) window.location.replace('/admin'); }, [expired]);

  if (!supportUntil) return null;

  async function end() {
    setEnding(true);
    setError('');
    const { error: rpcError } = await (createClient() as any).rpc('end_support_access', { p_organization_id: organizationId });
    if (rpcError) { setEnding(false); setError('Não foi possível encerrar. Tente de novo.'); return; }
    window.location.assign(`/admin/organizations/${organizationId}`);
  }

  const until = new Date(supportUntil).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const minutesLeft = Math.max(0, Math.round((Date.parse(supportUntil) - now) / 60_000));

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-[#CB0A9F] px-4 py-2 text-xs font-medium text-white">
      <p className="flex min-w-0 items-center gap-2">
        <LifeBuoy size={15} className="shrink-0" />
        <span className="truncate">Acesso de suporte a <strong>{organizationName}</strong>, liberado pelo cliente até {until}{minutesLeft <= 15 ? ` (faltam ${minutesLeft} min)` : ''}.</span>
      </p>
      <span className="flex items-center gap-3">
        {error && <span className="text-white/90">{error}</span>}
        <button type="button" onClick={() => void end()} disabled={ending} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-semibold transition hover:bg-white/25 disabled:opacity-60">
          {ending && <Loader2 size={13} className="animate-spin" />}Encerrar acesso
        </button>
      </span>
    </div>
  );
}
