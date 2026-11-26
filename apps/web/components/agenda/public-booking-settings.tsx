'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* o navegador recusou a cópia automática */ }
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

      {saved.enabled && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-tendi-line bg-tendi-haze/60 px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{link}</code>
          <button type="button" onClick={() => void copyLink()} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-tendi-navy shadow-card hover:bg-slate-50">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiado' : 'Copiar link'}</button>
        </div>
      )}

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!canManage || saving || !dirty} onClick={() => void save()} className="td-btn td-btn-teal disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}Salvar agendamento público</button>
        {!canManage && <p className="text-xs text-slate-400">Somente dono ou administrador altera o agendamento público.</p>}
      </div>
    </section>
  );
}
