'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { OggConversionError, webmOpusToOgg } from '@/lib/ogg-opus';
import { normalizeMime } from '@/lib/inbox-attachments';

export type RecordedAudio = { file: File; voice: boolean };

const MAX_SECONDS = 300;
const MIN_SECONDS = 1;
const CANDIDATES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'];

export function pickRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Transforma o que o navegador gravou em um arquivo que o WhatsApp toca:
 * - OGG/Opus (Firefox): já serve como nota de voz.
 * - WebM/Opus (Chrome, Edge): troca o container para OGG/Opus sem recodificar (nota de voz).
 * - MP4/AAC (Safari): vai como áudio comum.
 */
export async function finalizeRecording(blob: Blob, recordedType: string, now: number = Date.now()): Promise<RecordedAudio> {
  const base = normalizeMime(recordedType);
  const stamp = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  if (base === 'audio/ogg') return { file: new File([blob], `audio-${stamp}.ogg`, { type: 'audio/ogg' }), voice: true };
  if (base === 'audio/webm') {
    const ogg = webmOpusToOgg(new Uint8Array(await blob.arrayBuffer()));
    return { file: new File([ogg as unknown as BlobPart], `audio-${stamp}.ogg`, { type: 'audio/ogg' }), voice: true };
  }
  return { file: new File([blob], `audio-${stamp}.m4a`, { type: 'audio/mp4' }), voice: false };
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Botão de microfone. Grava, converte e entrega o arquivo pronto para o campo de mensagem. */
export function VoiceRecorder({ disabled, onRecorded, onError }: { disabled?: boolean; onRecorded: (audio: RecordedAudio) => void; onError: (message: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => { setSupported(pickRecordingType() !== null); }, []);

  const release = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    release();
  }, [release]);

  const stop = useCallback(() => { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); }, []);

  async function start() {
    const type = pickRecordingType();
    if (!type || disabled || state !== 'idle') return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('Não foi possível usar o microfone. Permita o acesso ao microfone no navegador e tente de novo.');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    cancelledRef.current = false;
    secondsRef.current = 0;
    setSeconds(0);
    const recorder = new MediaRecorder(stream, { mimeType: type });
    recorderRef.current = recorder;
    recorder.ondataavailable = event => { if (event.data && event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = async () => {
      release();
      const duration = secondsRef.current;
      if (cancelledRef.current) { setState('idle'); return; }
      if (duration < MIN_SECONDS) { setState('idle'); onError('Gravação muito curta. Segure um pouco mais.'); return; }
      setState('processing');
      try {
        onRecorded(await finalizeRecording(new Blob(chunksRef.current, { type: recorder.mimeType || type }), recorder.mimeType || type));
      } catch (error) {
        onError(error instanceof OggConversionError ? 'Não foi possível preparar o áudio gravado. Tente gravar de novo.' : 'Falha ao processar o áudio gravado.');
      } finally {
        setState('idle');
      }
    };
    recorder.start(1000);
    setState('recording');
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) stop();
    }, 1000);
  }

  function cancel() { cancelledRef.current = true; stop(); }

  if (!supported) return null;
  if (state === 'processing') return <span className="flex items-center gap-1.5 px-2 text-[11px] text-slate-500"><Loader2 size={14} className="animate-spin" />Preparando áudio…</span>;
  if (state === 'recording') {
    return <div role="status" className="flex items-center gap-2 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
      <span className="size-2 animate-pulse rounded-full bg-rose-500" />Gravando {clock(seconds)}
      <button type="button" onClick={cancel} aria-label="Cancelar gravação" className="rounded p-1 hover:bg-rose-100"><X size={14} /></button>
      <button type="button" onClick={stop} aria-label="Parar e anexar" className="rounded p-1 hover:bg-rose-100"><Square size={14} fill="currentColor" /></button>
    </div>;
  }
  return <button type="button" onClick={() => void start()} disabled={disabled} aria-label="Gravar áudio" title="Gravar áudio" className="rounded-lg p-2 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><Mic size={16} /></button>;
}
