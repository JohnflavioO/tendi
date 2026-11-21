'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function ImageUpload({ bucket, folder, value, onSaved, label }: {
  bucket: 'brand-assets' | 'profile-avatars'; folder: string; value?: string | null;
  onSaved: (url: string) => Promise<void>; label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="flex items-center gap-3">
    {value ? <img src={value} alt={label} className="size-14 rounded-xl object-cover" /> : <span className="flex size-14 items-center justify-center rounded-xl bg-tendi-haze text-xs text-slate-500">Sem foto</span>}
    <label className="cursor-pointer rounded-lg border border-tendi-line px-3 py-2 text-xs font-semibold text-tendi-indigo">
      {busy ? 'Enviando...' : label}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        setError('');
        if (file.size > 1048576 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
          setError('Use PNG, JPG ou WebP de até 1 MB.'); return;
        }
        setBusy(true);
        try {
          const supabase = createClient();
          const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
          const path = `${folder}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
          if (uploadError) throw uploadError;
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          await onSaved(data.publicUrl);
        } catch { setError('Não foi possível salvar a imagem.'); }
        finally { setBusy(false); e.target.value = ''; }
      }} />
    </label>
    {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
  </div>;
}
