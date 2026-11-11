'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

export const PLAYBACK_RATES = [1, 1.5, 2] as const;
const STORAGE_KEY = 'tendi:audio-rate';

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Próxima velocidade da sequência 1x → 1,5x → 2x → 1x. */
export function nextRate(current: number): number {
  const index = PLAYBACK_RATES.findIndex(rate => rate === current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]!;
}

function storedRate(): number {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return (PLAYBACK_RATES as readonly number[]).includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

/**
 * Player de áudio do Inbox: tocar/pausar, barra de progresso clicável, tempo e velocidade (1x, 1,5x, 2x).
 * A velocidade escolhida vale para os próximos áudios (fica guardada no navegador).
 * As cores seguem o balão (currentColor), então funciona no balão claro e no escuro.
 */
export function AudioPlayer({ src, onError }: { src: string; onError?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => { setRate(storedRate()); }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    // Só um áudio tocando por vez no Inbox.
    document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
    audio.playbackRate = rate;
    setLoading(audio.readyState < 3);
    try { await audio.play(); } catch { onError?.(); } finally { setLoading(false); }
  }

  function changeRate() {
    const next = nextRate(rate);
    setRate(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* sem armazenamento: vale só nesta página */ }
  }

  function seek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (Number(event.target.value) / 1000) * duration;
    setCurrent(audio.currentTime);
  }

  const progress = duration ? Math.min(1000, Math.round((current / duration) * 1000)) : 0;

  return <div className="mb-1 flex w-72 max-w-full items-center gap-2.5 py-1">
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      onDurationChange={event => setDuration(event.currentTarget.duration)}
      onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setCurrent(0); }}
      onError={onError}
      className="hidden"
    />
    <button type="button" onClick={() => void toggle()} aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#CB0A9F] text-white shadow-sm transition hover:scale-105 hover:bg-[#B5088D]">
      {loading ? <Loader2 size={16} className="animate-spin" /> : playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
    </button>
    <div className="min-w-0 flex-1">
      <input type="range" min={0} max={1000} value={progress} onChange={seek} aria-label="Posição do áudio" style={{ ['--progress' as string]: `${progress / 10}%` }} className="tendi-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full" />
      <p className="mt-1 text-[10px] tabular-nums opacity-70">{clock(current)} / {clock(duration)}</p>
    </div>
    <button type="button" onClick={changeRate} aria-label={`Velocidade ${rate}x. Clique para mudar.`} title="Velocidade de reprodução" className="shrink-0 rounded-full tendi-audio-rate px-2 py-1 text-[11px] font-bold tabular-nums opacity-90 transition hover:opacity-100">
      {String(rate).replace('.', ',')}x
    </button>
  </div>;
}
