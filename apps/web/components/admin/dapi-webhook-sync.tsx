'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Loader2, RefreshCw, Webhook } from 'lucide-react';

type Status = { baseUrl: string | null; sessions: number; connected: number };
type Result = { organization: string; ok: boolean; error?: string };

/**
 * Console › WhatsApp: mostra para qual domínio os webhooks da D-API apontam e atualiza todas as
 * sessões de uma vez (troca de domínio), sem desconectar nenhum WhatsApp.
 */
export function DapiWebhookSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/whatsapp/webhooks').then(r => (r.ok ? r.json() : null)).then(setStatus).catch(() => setStatus(null));
  }, []);

  async function sync() {
    if (!window.confirm(`Apontar o webhook de ${status?.sessions ?? 0} sessão(ões) do WhatsApp para ${status?.baseUrl}? Nenhum WhatsApp será desconectado.`)) return;
    setRunning(true); setError(''); setResults(null);
    const response = await fetch('/api/admin/whatsapp/webhooks', { method: 'POST' }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setRunning(false);
    if (!response?.ok) { setError(data?.error ?? 'Não foi possível atualizar.'); return; }
    setResults(data.results as Result[]);
  }

  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-[#E8F4F2] p-2.5 text-[#004751]"><Webhook size={18} /></span><div>
        <h3 className="text-sm font-bold text-[#2F316B]">Endereço dos webhooks</h3>
        <p className="mt-1 text-xs text-slate-500">As mensagens do WhatsApp chegam em <b className="font-mono text-slate-700">{status?.baseUrl ?? 'não configurado'}</b>{status ? ` · ${status.sessions} sessão(ões), ${status.connected} conectada(s)` : ''}.</p>
        <p className="mt-1 text-[11px] text-slate-400">Depois de trocar o domínio (variável DAPI_WEBHOOK_BASE_URL na Vercel), atualize todas as sessões. O WhatsApp dos clientes continua conectado.</p>
      </div></div>
      <button type="button" onClick={() => void sync()} disabled={running || !status?.baseUrl || !status.sessions} className="inline-flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Atualizar webhooks</button>
    </div>
    {error && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}
    {results && <ul className="mt-4 space-y-1.5">{results.map(item => <li key={item.organization} className="flex items-center gap-2 text-xs">{item.ok ? <CircleCheck size={14} className="text-emerald-600" /> : <CircleX size={14} className="text-rose-600" />}<span className="font-semibold text-slate-700">{item.organization}</span>{item.error && <span className="text-rose-600">· {item.error}</span>}</li>)}{!results.length && <li className="text-xs text-slate-400">Nenhuma sessão para atualizar.</li>}</ul>}
  </section>;
}
