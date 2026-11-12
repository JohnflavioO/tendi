'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, Forward, ImageOff, Loader2, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useMessageMedia } from '@/components/inbox/message-media';
import { downloadFilename } from '@/lib/inbox-media';

export type ViewerMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  message_type: string;
  body: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
};

export type ForwardTarget = { id: string; name: string; phone: string | null };

const MAX_FORWARD_TARGETS = 5;
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const toolButton = 'flex size-10 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

/**
 * Visualizador de imagens da conversa: abre por cima do Inbox, sem sair da página.
 * Ampliar, navegar entre as imagens da conversa, baixar e encaminhar para outras conversas.
 */
export function ImageViewer({ images, startId, senderName, targets, onClose, onForwarded }: {
  /** Imagens da conversa aberta, da mais antiga para a mais nova. */
  images: ViewerMessage[];
  startId: string;
  /** Nome de quem enviou cada imagem (contato ou equipe). */
  senderName: (message: ViewerMessage) => string;
  /** Conversas para onde a imagem pode ser encaminhada. */
  targets: ForwardTarget[];
  onClose: () => void;
  onForwarded: () => void;
}) {
  const [currentId, setCurrentId] = useState(startId);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const index = Math.max(0, images.findIndex(image => image.id === currentId));
  const current = images[index] ?? null;
  const { source, url, loading } = useMessageMedia(current);

  const go = useCallback((step: number) => {
    const next = images[index + step];
    if (next) { setCurrentId(next.id); setZoom(1); setFailed(false); setNotice(null); }
  }, [images, index]);

  // Teclado: Esc fecha (primeiro o painel de encaminhar), setas navegam, + e - ampliam.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (forwardOpen) setForwardOpen(false); else onClose(); return; }
      if (forwardOpen) return;
      if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === '+' || event.key === '=') setZoom(value => ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(value) + 1, ZOOM_STEPS.length - 1)] ?? value);
      else if (event.key === '-') setZoom(value => ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(value) - 1, 0)] ?? value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forwardOpen, go, onClose]);

  // Trava a rolagem da página e devolve o foco ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  async function download() {
    if (!current || !source || downloading) return;
    setDownloading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/inbox/media/${current.id}`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível baixar a imagem.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadFilename({ kind: source.kind, filename: source.filename, mimetype: blob.type || source.mimetype, createdAt: current.created_at });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      setNotice({ tone: 'ok', text: 'Imagem baixada.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível baixar a imagem.' });
    } finally { setDownloading(false); }
  }

  if (!current) return null;
  const caption = current.body && current.body.trim() ? current.body : null;
  const zoomIndex = ZOOM_STEPS.indexOf(zoom);

  return (
    <div role="dialog" aria-modal="true" aria-label="Visualizador de imagem" className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 text-white">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{senderName(current)}</p>
          <p className="truncate text-[11px] text-white/60">{when(current.created_at)}{images.length > 1 ? ` · ${index + 1} de ${images.length}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={toolButton} onClick={() => setZoom(ZOOM_STEPS[Math.max(zoomIndex - 1, 0)]!)} disabled={zoomIndex <= 0} aria-label="Diminuir" title="Diminuir (-)"><ZoomOut size={18} /></button>
          <button type="button" className={toolButton} onClick={() => setZoom(ZOOM_STEPS[Math.min(zoomIndex + 1, ZOOM_STEPS.length - 1)]!)} disabled={zoomIndex >= ZOOM_STEPS.length - 1} aria-label="Ampliar" title="Ampliar (+)"><ZoomIn size={18} /></button>
          <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
          <button type="button" className={toolButton} onClick={() => void download()} disabled={downloading || !url} aria-label="Baixar imagem" title="Baixar">{downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}</button>
          <button type="button" className={toolButton} onClick={() => { setNotice(null); setForwardOpen(true); }} disabled={!url} aria-label="Encaminhar imagem" title="Encaminhar"><Forward size={18} /></button>
          {url && <a href={url} target="_blank" rel="noreferrer noopener" className={toolButton} aria-label="Abrir em nova aba" title="Abrir em nova aba"><ExternalLink size={18} /></a>}
          <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
          <button ref={closeRef} type="button" className={toolButton} onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={20} /></button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Clique fora da imagem fecha. */}
        <div className="flex h-full w-full overflow-auto" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
          {loading && !url ? (
            <p className="m-auto flex items-center gap-2 text-sm text-white/70"><Loader2 size={18} className="animate-spin" />Carregando imagem…</p>
          ) : !url || failed ? (
            <p className="m-auto flex items-center gap-2 text-sm text-white/70"><ImageOff size={18} />Imagem indisponível</p>
          ) : (
            <img
              key={current.id}
              src={url}
              alt={caption ?? 'Imagem da conversa'}
              onError={() => setFailed(true)}
              onClick={() => setZoom(value => (value === 1 ? 2 : 1))}
              draggable={false}
              style={zoom === 1 ? undefined : { width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: 'none' }}
              className={zoom === 1 ? 'm-auto max-h-full max-w-full cursor-zoom-in object-contain p-4' : 'm-auto h-auto shrink-0 cursor-zoom-out'}
            />
          )}
        </div>
        {index > 0 && <button type="button" onClick={() => go(-1)} aria-label="Imagem anterior" title="Anterior (←)" className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><ChevronLeft size={22} /></button>}
        {index < images.length - 1 && <button type="button" onClick={() => go(1)} aria-label="Próxima imagem" title="Próxima (→)" className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><ChevronRight size={22} /></button>}
      </div>

      {(caption || notice) && (
        <footer className="shrink-0 px-4 py-3 text-center">
          {caption && <p className="mx-auto max-h-24 max-w-3xl overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-white/90">{caption}</p>}
          {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mx-auto mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${notice.tone === 'error' ? 'bg-rose-500/20 text-rose-100' : 'bg-emerald-500/20 text-emerald-100'}`}>{notice.tone === 'ok' && <Check size={14} />}{notice.text}</p>}
        </footer>
      )}

      {forwardOpen && (
        <ForwardPanel
          messageId={current.id}
          hasCaption={Boolean(caption)}
          targets={targets.filter(target => target.id !== current.conversation_id)}
          onClose={() => setForwardOpen(false)}
          onDone={text => { setForwardOpen(false); setNotice({ tone: 'ok', text }); onForwarded(); }}
        />
      )}
    </div>
  );
}

function ForwardPanel({ messageId, hasCaption, targets, onClose, onDone }: {
  messageId: string;
  hasCaption: boolean;
  targets: ForwardTarget[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [includeCaption, setIncludeCaption] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    if (!term) return targets;
    return targets.filter(target => target.name.toLowerCase().includes(term) || (digits.length > 0 && (target.phone ?? '').replace(/\D/g, '').includes(digits)));
  }, [search, targets]);

  const toggle = (id: string) => {
    setError('');
    setChosen(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= MAX_FORWARD_TARGETS) { setError(`Escolha até ${MAX_FORWARD_TARGETS} conversas por vez.`); return current; }
      return [...current, id];
    });
  };

  async function submit() {
    if (!chosen.length || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/inbox/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, conversationIds: chosen, includeCaption: hasCaption && includeCaption }),
      });
      const payload = await response.json().catch(() => ({}));
      const results = Array.isArray(payload.results) ? (payload.results as Array<{ conversationId: string; success: boolean; error?: string }>) : [];
      const failures = results.filter(result => !result.success);
      if (!response.ok || !payload.success) {
        throw new Error(failures[0]?.error ?? (typeof payload.error === 'string' ? payload.error : 'Não foi possível encaminhar.'));
      }
      if (failures.length) {
        // Parte foi enviada: mantém só as que falharam selecionadas, para tentar de novo.
        setChosen(failures.map(failure => failure.conversationId));
        setError(`Enviada para ${payload.sent} conversa(s). ${failures.length} falhou: ${failures[0]!.error ?? 'erro ao enviar'}`);
        return;
      }
      onDone(chosen.length === 1 ? 'Imagem encaminhada.' : `Imagem encaminhada para ${chosen.length} conversas.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível encaminhar.');
    } finally { setSending(false); }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 p-4" onClick={event => { if (event.target === event.currentTarget && !sending) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Encaminhar imagem" className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white text-slate-800 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-base font-bold text-[#25275B]">Encaminhar imagem</h2><p className="mt-0.5 text-xs text-slate-500">Escolha até {MAX_FORWARD_TARGETS} conversas deste workspace.</p></div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="border-b border-slate-100 px-5 py-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#FBFCFE] px-3 py-2.5 focus-within:border-[#004751]">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome ou telefone" aria-label="Buscar conversa" className="w-full bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-slate-400" />
          </label>
        </div>
        <ul className="min-h-[120px] flex-1 overflow-y-auto px-2 py-2">
          {visible.length ? visible.map(target => {
            const selected = chosen.includes(target.id);
            return (
              <li key={target.id}>
                <button type="button" role="checkbox" aria-checked={selected} onClick={() => toggle(target.id)} disabled={sending} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-[#004751]/[.06]' : 'hover:bg-slate-50'}`}>
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-[#004751] bg-[#004751] text-white' : 'border-slate-300 bg-white'}`}>{selected && <Check size={13} />}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#25275B]">{target.name}</span>{target.phone && target.phone !== target.name && <span className="block truncate text-[11px] text-slate-400">{target.phone}</span>}</span>
                </button>
              </li>
            );
          }) : <li className="px-3 py-8 text-center text-sm text-slate-400">{targets.length ? 'Nenhuma conversa encontrada.' : 'Não há outras conversas para encaminhar.'}</li>}
        </ul>
        <footer className="border-t border-slate-200 px-5 py-4">
          {hasCaption && <label className="mb-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeCaption} onChange={event => setIncludeCaption(event.target.checked)} disabled={sending} className="size-4 accent-[#004751]" />Enviar junto a legenda da imagem</label>}
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button type="button" onClick={() => void submit()} disabled={!chosen.length || sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#003B44] disabled:cursor-not-allowed disabled:opacity-40">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Forward size={16} />}
            {sending ? 'Encaminhando…' : chosen.length > 1 ? `Encaminhar para ${chosen.length} conversas` : 'Encaminhar'}
          </button>
        </footer>
      </section>
    </div>
  );
}
