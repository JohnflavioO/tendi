'use client';

import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

type Usage = { enabled: boolean; used?: number; limit?: number; level?: 'ok' | 'warning' | 'reached'; trial?: boolean };

/** Uso da IA no mês (respostas usadas / limite). Só aparece quando o agente de IA está liberado. */
export function AiUsageNotice({ organizationId, compact = false }: { organizationId?: string | null; compact?: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let active = true;
    setUsage(null);
    if (!organizationId) return;
    fetch(`/api/ai/usage?organization=${encodeURIComponent(organizationId)}`)
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (active && data) setUsage(data as Usage); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [organizationId]);

  if (!usage?.enabled || usage.limit === undefined || usage.used === undefined) return null;
  // No menu lateral, só chama atenção quando estiver perto do limite.
  if (compact && usage.level === 'ok') return null;

  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const reached = usage.level === 'reached';
  const tone = reached ? 'border-rose-200 bg-rose-50 text-rose-700' : usage.level === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600';

  return <div role="status" className={`rounded-xl border p-3 text-xs ${tone}`}>
    <p className="flex items-center gap-2 font-semibold"><Bot size={14} />Agente de IA</p>
    <p className="mt-1">{usage.used.toLocaleString('pt-BR')} de {usage.limit.toLocaleString('pt-BR')} respostas neste mês</p>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5"><div className={reached ? 'h-full bg-rose-500' : usage.level === 'warning' ? 'h-full bg-amber-500' : 'h-full bg-[#004751]'} style={{ width: `${percent}%` }} /></div>
    {reached
      ? <p className="mt-2">Limite atingido: as novas mensagens ficam para a sua equipe até o dia 1º. <a href={`/assinatura?organization=${organizationId}`} className="font-semibold underline">{usage.trial ? 'Assinar um plano' : 'Ver planos'}</a></p>
      : usage.level === 'warning' ? <p className="mt-2">Você já usou {percent}% das respostas do mês.</p> : null}
  </div>;
}
