'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Facebook, Instagram, Loader2, Unplug } from 'lucide-react';

type Connection = { id: string; channel: string; display_name: string; status: string };
type MetaPage = { id: string; name: string };

const ERROR_LABEL: Record<string, string> = {
  cancelado: 'Login cancelado na Meta.',
  estado_invalido: 'A confirmação da Meta não bateu. Tente conectar de novo.',
  sessao_expirada: 'A sessão com a Meta expirou. Tente conectar de novo.',
  falha_na_troca_de_token: 'A Meta não concluiu o login. Tente de novo em instantes.',
  falha_na_conexao: 'Não foi possível concluir a conexão com o Instagram. Tente de novo.',
  servidor_sem_credenciais: 'O servidor está sem credenciais do banco no momento.',
};

function cleanUrl(params: string[]) {
  const url = new URL(window.location.href);
  params.forEach(param => url.searchParams.delete(param));
  window.history.replaceState({}, '', url.toString());
}

/**
 * Canal "Conexões" > Instagram e Messenger. São dois produtos separados pela Meta, com login
 * próprio cada um: o Messenger entra pela página do Facebook; o Instagram entra direto com a
 * conta do Instagram, sem página nenhuma. Por isso são dois botões, não um só.
 */
export function MetaConnectionCard({ organizationId, connections, canManage, onChanged }: {
  organizationId: string;
  connections: Connection[];
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [configured, setConfigured] = useState<{ messenger: boolean; instagram: boolean } | null>(null);
  const [step, setStep] = useState<'idle' | 'choose'>('idle');
  const [pages, setPages] = useState<MetaPage[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    fetch('/api/meta/status').then(response => response.json())
      .then(data => setConfigured({ messenger: Boolean(data.messengerConfigured), instagram: Boolean(data.instagramConfigured) }))
      .catch(() => setConfigured({ messenger: false, instagram: false }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaError = params.get('metaError');
    const igError = params.get('igError');
    const metaStep = params.get('metaStep');
    const igConnected = params.get('igConnected');
    if (metaError) { setError(ERROR_LABEL[metaError] ?? 'Não foi possível conectar o Messenger.'); cleanUrl(['metaError']); }
    if (igError) { setError(ERROR_LABEL[igError] ?? 'Não foi possível conectar o Instagram.'); cleanUrl(['igError']); }
    if (igConnected) { setNotice(igConnected === '1' ? 'Instagram conectado.' : `Instagram conectado: @${igConnected}.`); cleanUrl(['igConnected']); void onChanged(); }
    if (metaStep === 'choose') {
      setStep('choose');
      cleanUrl(['metaStep']);
      fetch('/api/meta/pages').then(response => response.json()).then(data => {
        if (data.error) { setError(data.error); setStep('idle'); return; }
        setPages(data.pages ?? []);
      }).catch(() => { setError('Não foi possível listar as páginas do Facebook.'); setStep('idle'); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messenger = useMemo(() => connections.find(item => item.channel === 'messenger'), [connections]);
  const instagram = useMemo(() => connections.find(item => item.channel === 'instagram'), [connections]);

  async function connectPage(pageId: string) {
    setBusy(pageId);
    setError('');
    const response = await fetch('/api/meta/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, pageId }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy('');
    if (!response?.ok) { setError(typeof payload.error === 'string' ? payload.error : 'Não foi possível conectar.'); return; }
    setStep('idle');
    setPages(null);
    setNotice(`Messenger conectado: ${payload.pageName}.`);
    await onChanged();
  }

  async function disconnect(connectionId: string) {
    if (!window.confirm('Desconectar este canal da Meta?')) return;
    setBusy(connectionId);
    const response = await fetch('/api/meta/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy('');
    if (!response?.ok) { setError(typeof payload.error === 'string' ? payload.error : 'Não foi possível desconectar.'); return; }
    await onChanged();
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6';
  const statusTag = (status: string) => status === 'connected'
    ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Conectado</span>
    : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">Não conectado</span>;

  return (
    <section className={card}>
      <div className="flex items-start gap-4">
        <span className="rounded-2xl bg-[#F0F0FA] p-4 text-[#2F316B]"><Instagram size={22} /></span>
        <div>
          <h2 className="text-lg font-bold text-[#25275B]">Instagram e Messenger</h2>
          <p className="mt-1 text-xs text-slate-500">São dois cadastros separados pela própria Meta, cada um com seu login: o Messenger pela página do Facebook, o Instagram direto pela conta.</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}

      {configured === null ? (
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" />Verificando configuração…</p>
      ) : step === 'choose' ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-[#FBFCFE] p-4">
          <p className="text-xs font-bold text-[#25275B]">Escolha a página do Facebook (Messenger)</p>
          {pages === null ? <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" />Carregando páginas…</p>
            : pages.length === 0 ? <p className="mt-3 text-xs text-slate-500">Nenhuma página encontrada. Confira se a conta usada administra uma página do Facebook.</p>
            : <ul className="mt-3 space-y-2">{pages.map(page => (
                <li key={page.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-[#25275B]">{page.name}</p>
                  <button type="button" onClick={() => void connectPage(page.id)} disabled={busy === page.id} className="flex items-center gap-2 rounded-lg bg-[#004751] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === page.id && <Loader2 size={13} className="animate-spin" />}Conectar</button>
                </li>
              ))}</ul>}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-[#25275B]"><Facebook size={16} />Messenger</span>{statusTag(messenger?.status ?? 'disconnected')}</div>
            {messenger?.status === 'connected' && <p className="mt-1 truncate text-[11px] text-slate-400">{messenger.display_name}</p>}
            <div className="mt-3">
              {messenger?.status === 'connected' ? (
                canManage && <button type="button" onClick={() => void disconnect(messenger.id)} disabled={busy === messenger.id} className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50">{busy === messenger.id ? <Loader2 size={13} className="animate-spin" /> : <Unplug size={13} />}Desconectar</button>
              ) : !configured.messenger ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Falta <code>META_APP_ID</code>/<code>META_APP_SECRET</code> no servidor.</p>
              ) : canManage && (
                <a href={`/api/meta/oauth/start?organizationId=${organizationId}`} className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0E63D1]"><Facebook size={14} />Conectar com Facebook</a>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-[#25275B]"><Instagram size={16} />Instagram</span>{statusTag(instagram?.status ?? 'disconnected')}</div>
            {instagram?.status === 'connected' && <p className="mt-1 truncate text-[11px] text-slate-400">{instagram.display_name}</p>}
            <div className="mt-3">
              {instagram?.status === 'connected' ? (
                canManage && <button type="button" onClick={() => void disconnect(instagram.id)} disabled={busy === instagram.id} className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50">{busy === instagram.id ? <Loader2 size={13} className="animate-spin" /> : <Unplug size={13} />}Desconectar</button>
              ) : !configured.instagram ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Falta <code>META_INSTAGRAM_APP_ID</code>/<code>META_INSTAGRAM_APP_SECRET</code> no servidor.</p>
              ) : canManage && (
                <a href={`/api/meta/instagram/oauth/start?organizationId=${organizationId}`} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"><Instagram size={14} />Conectar Instagram</a>
              )}
            </div>
          </div>
        </div>
      )}
      {configured && !configured.messenger && !configured.instagram && step !== 'choose' && (
        <p className="mt-3 text-[11px] text-slate-400">Veja o passo a passo completo em docs/meta-channels.md.</p>
      )}

      {(messenger?.status === 'connected' || instagram?.status === 'connected') && step !== 'choose' && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400"><Check size={13} className="text-emerald-600" />As mensagens recebidas já entram nesta Inbox. O envio de respostas por aqui ainda está em preparação; por enquanto, responda pelo próprio Instagram/Messenger.</p>
      )}
    </section>
  );
}
