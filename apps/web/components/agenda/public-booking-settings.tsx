'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Instagram, Link2, Loader2, Megaphone, QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import { PUBLIC_BOOKING_NOTICE_OPTIONS, PUBLIC_BOOKING_WINDOW_OPTIONS, normalizePublicBookingSettings } from '@/lib/agenda-public';
import { fieldClass, labelClass, type AgendaOrganization } from '@/components/agenda/types';

const noticeLabel = (minutes: number) => (minutes === 0 ? 'Sem antecedência mínima' : minutes < 60 ? `${minutes} minutos` : `${minutes / 60} h`);

/** Link público de agendamento: liga/desliga, janela de dias e antecedência mínima. */
export function PublicBookingSettingsCard({ organization, canManage, customerLabel, onChanged }: {
  organization: AgendaOrganization;
  canManage: boolean;
  customerLabel: string;
  onChanged: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const saved = normalizePublicBookingSettings(organization.agenda_settings);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [windowDays, setWindowDays] = useState(saved.windowDays);
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(saved.minNoticeMinutes);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const dirty = enabled !== saved.enabled || windowDays !== saved.windowDays || minNoticeMinutes !== saved.minNoticeMinutes;
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/agendar/${organization.slug}`;

  async function save() {
    setSaving(true);
    setMessage(null);
    const current = organization.agenda_settings && typeof organization.agenda_settings === 'object' && !Array.isArray(organization.agenda_settings)
      ? (organization.agenda_settings as Record<string, unknown>)
      : {};
    const next = { ...current, publicBooking: { enabled, windowDays, minNoticeMinutes } };
    const { data, error } = await supabase.from('organizations').update({ agenda_settings: next }).eq('id', organization.id).select('id');
    setSaving(false);
    if (error) { setMessage({ ok: false, text: `Não foi possível salvar: ${error.message}` }); return; }
    if (!(data ?? []).length) { setMessage({ ok: false, text: 'Só o dono ou um administrador pode alterar o agendamento público.' }); return; }
    await onChanged();
    setMessage({ ok: true, text: enabled ? 'Agendamento público ligado. Compartilhe o link abaixo.' : 'Agendamento público desligado.' });
  }

  /** Cópia automática (clipboard) com um método alternativo (selecionar + copiar) para navegadores que a recusam. */
  function legacyCopy(text: string): boolean {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  async function copyLink() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (legacyCopy(link)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
      else setCopyError(true);
    }
  }

  function downloadQr() {
    const canvas = qrRef.current;
    if (!canvas) return;
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `agendamento-${organization.slug}.png`;
    anchor.click();
  }

  return (
    <section className="td-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="td-icon td-icon-magenta"><Link2 size={18} /></span>
          <div>
            <h2 className="td-title text-base">Link público de agendamento</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">{customerLabel === 'Paciente' ? 'Pacientes' : 'Clientes'} marcam o próprio horário por um link, sem precisar chamar no WhatsApp. Só aparecem profissionais e serviços ativos.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" role="switch" aria-checked={enabled} checked={enabled} disabled={!canManage || saving} onChange={event => setEnabled(event.target.checked)} className="size-4 accent-tendi-teal" />
          {enabled ? 'Ligado' : 'Desligado'}
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="public-booking-window" className={labelClass}>Até quantos dias à frente</label>
          <select id="public-booking-window" value={windowDays} disabled={!canManage || saving} onChange={event => setWindowDays(Number(event.target.value))} className={fieldClass}>
            {PUBLIC_BOOKING_WINDOW_OPTIONS.map(days => <option key={days} value={days}>{days} dias</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="public-booking-notice" className={labelClass}>Antecedência mínima</label>
          <select id="public-booking-notice" value={minNoticeMinutes} disabled={!canManage || saving} onChange={event => setMinNoticeMinutes(Number(event.target.value))} className={fieldClass}>
            {PUBLIC_BOOKING_NOTICE_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{noticeLabel(minutes)}</option>)}
          </select>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border border-tendi-line p-3.5 ${saved.enabled ? 'bg-tendi-haze/60' : 'bg-slate-50'}`}>
        {!saved.enabled && <p className="mb-2.5 text-xs font-medium text-amber-700">Ligue e salve para este link funcionar. Ele já pode ser copiado para deixar tudo pronto.</p>}
        {copyError && <p className="mb-2.5 text-xs font-medium text-red-700">Não consegui copiar automaticamente. Selecione o link acima e copie manualmente (Ctrl+C).</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{link}</code>
            <button type="button" onClick={() => void copyLink()} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-tendi-navy shadow-card hover:bg-slate-50">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiado' : 'Copiar link'}</button>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 sm:border-l sm:border-tendi-line sm:pl-3">
            <div className="rounded-lg bg-white p-1.5 shadow-card"><QRCodeCanvas ref={qrRef} value={link} size={64} level="M" /></div>
            <button type="button" onClick={downloadQr} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-tendi-navy shadow-card hover:bg-slate-50"><Download size={13} />Baixar QR</button>
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-[11px] leading-4 text-slate-500">
        <li className="flex items-start gap-1.5"><Instagram size={13} className="mt-px shrink-0" />Cole esse link na bio do Instagram ou do WhatsApp Business.</li>
        <li className="flex items-start gap-1.5"><Megaphone size={13} className="mt-px shrink-0" />Use como destino de anúncios (Meta Ads, Google Ads).</li>
        <li className="flex items-start gap-1.5"><QrCode size={13} className="mt-px shrink-0" />Imprima o QR code no balcão, num cartão ou numa plaquinha.</li>
      </ul>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!canManage || saving || !dirty} onClick={() => void save()} className="td-btn td-btn-teal disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}Salvar agendamento público</button>
        {!canManage && <p className="text-xs text-slate-400">Somente dono ou administrador altera o agendamento público.</p>}
      </div>
    </section>
  );
}
