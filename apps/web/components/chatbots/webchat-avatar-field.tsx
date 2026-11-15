'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { checkBrandImage, squareImage } from '@/lib/image-resize';

const BUCKET = 'brand-assets';

/** Caminho do arquivo dentro do bucket a partir do endereço público (para apagar a imagem antiga). */
function storagePath(publicUrl: string | null): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl?.indexOf(marker) ?? -1;
  return publicUrl && index >= 0 ? decodeURIComponent(publicUrl.slice(index + marker.length).split('?')[0]!) : null;
}

/**
 * Conexões › Webchat: logo ou avatar que aparece no cabeçalho e no convite do chat do site.
 * Sem imagem, o chat mostra a inicial do nome exibido.
 */
export function WebchatAvatarField({ widgetId, organizationId, value, displayName, color, canManage, onChange }: {
  widgetId: string;
  organizationId: string;
  value: string | null;
  displayName: string;
  color: string;
  canManage: boolean;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const initial = (displayName.split(/\s[·|•-]\s/)[0] || 'A').trim().charAt(0).toUpperCase() || 'A';

  async function upload(file: File) {
    const problem = checkBrandImage(file);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const blob = await squareImage(file, 256);
      const extension = blob.type === 'image/png' ? 'png' : 'webp'; // sempre webp hoje (fundo branco, arquivo leve)
      const path = `${organizationId}/webchat-avatar-${Date.now()}.${extension}`;
      const supabase = createClient() as any;
      const uploaded = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (uploaded.error) throw new Error('Não foi possível enviar a imagem.');
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;
      const saved = await supabase.from('webchat_widgets').update({ avatar_url: url }).eq('id', widgetId);
      if (saved.error) throw new Error('Não foi possível salvar a imagem.');
      const old = storagePath(value);
      if (old) void supabase.storage.from(BUCKET).remove([old]);
      onChange(url);
    } catch (problemError) {
      setError(problemError instanceof Error ? problemError.message : 'Não foi possível enviar a imagem.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true); setError('');
    const supabase = createClient() as any;
    const saved = await supabase.from('webchat_widgets').update({ avatar_url: null }).eq('id', widgetId);
    setBusy(false);
    if (saved.error) { setError('Não foi possível remover a imagem.'); return; }
    const old = storagePath(value);
    if (old) void supabase.storage.from(BUCKET).remove([old]);
    onChange(null);
  }

  return <div>
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Imagem do chat (logo ou avatar)</span>
    <div className="flex items-center gap-4">
      <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-xl font-bold text-white shadow-sm" style={{ background: value ? '#fff' : `linear-gradient(145deg, ${color}, #1f2a44)` }}>
        {value ? <img src={value} alt="Imagem do chat" className="size-full object-cover" /> : initial}
        <span className="absolute bottom-1 right-1 size-3 rounded-full border-2 border-white bg-emerald-500" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!canManage || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        <button type="button" disabled={!canManage || busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-[#004751] hover:bg-slate-50 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}{value ? 'Trocar imagem' : 'Enviar imagem'}
        </button>
        {value && <button type="button" disabled={!canManage || busy} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={14} />Remover</button>}
      </div>
    </div>
    <p className="mt-1.5 text-[11px] text-slate-400">PNG, JPG ou WEBP. Ela é recortada em quadrado e reduzida para carregar rápido. Sem imagem, o chat mostra a inicial do nome.</p>
    {error && <p role="alert" className="mt-1 text-[11px] text-rose-600">{error}</p>}
  </div>;
}
