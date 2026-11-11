'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, Smile, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { EmojiPicker } from '@/components/inbox/emoji-picker';
import { SenderName } from '@/components/inbox/sender-name';
import { VoiceRecorder, type RecordedAudio } from '@/components/inbox/voice-recorder';
import {
  ATTACHMENT_ACCEPT, KIND_LABEL, MAX_CAPTION_LENGTH, MEDIA_BUCKET, buildStoragePath, checkFileBeforeUpload,
  kindFromMime, normalizeMime, type AttachmentKind,
} from '@/lib/inbox-attachments';

type Pending = { file: File; kind: AttachmentKind; previewUrl: string | null; voice: boolean };

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Campo de mensagem do Inbox: texto, emojis, anexo (clipe ou colar imagem), gravação de voz e envio.
 * O arquivo vai direto para o Storage e só o caminho dele segue para a API de envio.
 */
export function Composer({ conversation, onSent, onError }: {
  conversation: { id: string; organization_id: string };
  onSent: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dropPending = () => setPending(current => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return null; });
  // Um anexo nunca pode "seguir" para outra conversa: ao trocar de conversa ele é descartado.
  useEffect(() => { dropPending(); }, [conversation.id]);
  useEffect(() => () => { setPending(current => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return current; }); }, []);

  function selectFile(file: File, voice = false) {
    const problem = checkFileBeforeUpload(file);
    if (problem) { onError(problem); return; }
    const kind = kindFromMime(file.type)!;
    const previewUrl = kind === 'document' ? null : URL.createObjectURL(file);
    setPending(current => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return { file, kind, previewUrl, voice }; });
    if (kind === 'audio') setDraft('');
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => { if (el) { el.focus(); const position = start + emoji.length; el.setSelectionRange(position, position); } });
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !pending) || sending) return;
    setSending(true);
    try {
      let attachment: Record<string, unknown> | undefined;
      if (pending) {
        const supabase = createClient() as any;
        const mimetype = normalizeMime(pending.file.type);
        const path = buildStoragePath(conversation.organization_id, conversation.id, pending.file.name, crypto.randomUUID());
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, pending.file, { contentType: mimetype, upsert: false });
        if (uploadError) throw new Error(`Não foi possível enviar o arquivo: ${uploadError.message}`);
        attachment = { path, mimetype, filename: pending.file.name, size: pending.file.size, voice: pending.voice };
      }
      const response = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, text, ...(attachment ? { attachment } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível enviar a mensagem.');
      setDraft('');
      dropPending();
      await onSent();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.';
      await Promise.resolve(onSent()).catch(() => undefined); // recarrega primeiro: a recarga limpa o erro ao começar
      onError(message);
    } finally { setSending(false); }
  }

  const audioPending = pending?.kind === 'audio';
  const placeholder = audioPending ? 'Áudios não têm legenda' : pending ? 'Legenda (opcional)…' : 'Escreva sua mensagem...';

  return <form onSubmit={event => void send(event)} className="border-t border-slate-200/80 bg-white p-4 md:px-6">
    <div className="rounded-2xl border border-slate-200 bg-[#FBFCFE] p-3 shadow-[0_4px_18px_rgba(35,45,90,.04)] focus-within:border-[#A7A8D0]">
      {pending && <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
        {pending.kind === 'image' && pending.previewUrl && <img src={pending.previewUrl} alt="Prévia do anexo" className="size-14 rounded-lg object-cover" />}
        {pending.kind === 'video' && pending.previewUrl && <video src={pending.previewUrl} className="size-14 rounded-lg object-cover" muted />}
        {pending.kind === 'audio' && pending.previewUrl && <audio src={pending.previewUrl} controls className="h-10 w-56 max-w-full" />}
        {pending.kind === 'document' && <span className="flex size-14 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText size={22} /></span>}
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{pending.file.name}</p><p className="text-[10px] text-slate-400">{KIND_LABEL[pending.kind]}{pending.voice ? ' · nota de voz' : ''} · {sizeLabel(pending.file.size)}</p></div>
        <button type="button" onClick={dropPending} disabled={sending} aria-label="Remover anexo" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
      </div>}
      <textarea ref={textareaRef} value={draft} disabled={audioPending} maxLength={pending ? MAX_CAPTION_LENGTH : undefined} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        onPaste={e => { const image = Array.from(e.clipboardData?.files ?? []).find(file => file.type.startsWith('image/')); if (image) { e.preventDefault(); selectFile(image); } }}
        placeholder={placeholder} rows={2} className="w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-6 outline-none focus-visible:outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" />
      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <div className="flex items-center gap-1 text-slate-400">
          <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} hidden aria-label="Escolher arquivo" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) selectFile(file); }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || !!pending} aria-label="Anexar arquivo" title="Anexar imagem, vídeo, áudio ou documento" className="rounded-lg p-2 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><Paperclip size={16} /></button>
          <div className="relative"><button type="button" onClick={() => setEmojiOpen(v => !v)} aria-label="Emojis" aria-expanded={emojiOpen} disabled={audioPending} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40" title="Emojis"><Smile size={16} /></button>{emojiOpen && <EmojiPicker onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />}</div>
          <VoiceRecorder disabled={sending || !!pending} onError={onError} onRecorded={(audio: RecordedAudio) => selectFile(audio.file, audio.voice)} />
          <span className="ml-2 hidden text-[10px] sm:inline">Enter para enviar · Shift + Enter para nova linha</span>
        </div>
        <button disabled={sending || (!draft.trim() && !pending)} className="flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003B44] disabled:cursor-not-allowed disabled:opacity-40">{sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}Enviar</button>
      </div>
    </div>
    <SenderName />
  </form>;
}
