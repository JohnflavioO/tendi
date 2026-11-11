'use client';

import { useEffect, useState } from 'react';
import { FileText, ImageOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MEDIA_BUCKET } from '@/lib/inbox-attachments';
import { AudioPlayer } from '@/components/inbox/audio-player';
import { MEDIA_LABEL, mediaKind, safeMediaUrl } from '@/lib/inbox-utils';

type MediaMessage = { message_type: string; body: string | null; payload: Record<string, unknown> | null };

const textClass = 'whitespace-pre-wrap text-[13px] leading-6';

// Links assinados do Storage valem 1 h; guardamos por 50 min para não pedir de novo a cada renderização.
const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** Mídia enviada pela equipe fica no Storage privado: gera um link temporário para exibir. */
function useSignedMediaUrl(path: string | null): { url: string | null; loading: boolean } {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: Boolean(path) });
  useEffect(() => {
    if (!path) { setState({ url: null, loading: false }); return; }
    const cached = signedCache.get(path);
    if (cached && cached.expiresAt > Date.now()) { setState({ url: cached.url, loading: false }); return; }
    let active = true;
    setState({ url: null, loading: true });
    void (createClient() as any).storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600).then(({ data, error }: any) => {
      if (!active) return;
      const url = !error && typeof data?.signedUrl === 'string' ? safeMediaUrl(data.signedUrl) : null;
      if (url) signedCache.set(path, { url, expiresAt: Date.now() + 50 * 60 * 1000 });
      setState({ url, loading: false });
    });
    return () => { active = false; };
  }, [path]);
  return state;
}

/**
 * Conteúdo de uma mensagem: mídia (imagem, vídeo, áudio, documento, figurinha) e/ou texto.
 * O link da mídia vem do webhook da D-API (payload.media_url) e só é usado se for http(s).
 */
export function MessageMedia({ message }: { message: MediaMessage }) {
  const [failed, setFailed] = useState(false);
  const kind = mediaKind(message.message_type);
  const payload = message.payload ?? {};
  const stored = payload.media && typeof payload.media === 'object' ? (payload.media as Record<string, unknown>) : null;
  const directUrl = kind ? safeMediaUrl(payload.media_url) : null;
  const storagePath = kind && !directUrl && typeof stored?.path === 'string' ? stored.path : null;
  const signed = useSignedMediaUrl(storagePath);
  const url = directUrl ?? signed.url;
  const nameSource = typeof payload.filename === 'string' ? payload.filename : typeof stored?.filename === 'string' ? stored.filename : '';
  const filename = nameSource.trim() ? nameSource.trim() : null;
  const caption = message.body && message.body.trim() ? message.body : null;

  let media: React.ReactNode = null;
  if (kind) {
    if (signed.loading && !url) {
      media = <p className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs opacity-80"><Loader2 size={14} className="animate-spin" />Carregando {MEDIA_LABEL[kind].toLowerCase()}…</p>;
    } else if (!url || failed) {
      media = <p className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs opacity-80"><ImageOff size={14} />{MEDIA_LABEL[kind]} indisponível</p>;
    } else if (kind === 'image' || kind === 'sticker') {
      media = <a href={url} target="_blank" rel="noreferrer noopener" className="mb-1 block"><img src={url} alt={caption ?? MEDIA_LABEL[kind]} loading="lazy" onError={() => setFailed(true)} className={kind === 'sticker' ? 'max-h-40 w-auto' : 'max-h-72 w-auto max-w-full rounded-xl object-cover'} /></a>;
    } else if (kind === 'video') {
      media = <video controls preload="metadata" src={url} onError={() => setFailed(true)} className="mb-1 max-h-72 w-full max-w-sm rounded-xl" />;
    } else if (kind === 'audio') {
      media = <AudioPlayer src={url} onError={() => setFailed(true)} />;
    } else {
      media = <a href={url} target="_blank" rel="noreferrer noopener" className="mb-1 flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2.5 text-xs font-semibold hover:bg-black/10"><FileText size={18} className="shrink-0" /><span className="min-w-0 truncate">{filename ?? 'Documento'}</span><span className="ml-auto shrink-0 text-[10px] font-medium opacity-70">Abrir</span></a>;
    }
  }

  const text = caption ?? (kind ? null : `[${message.message_type}]`);
  return <>{media}{text && <p className={textClass}>{text}</p>}</>;
}
