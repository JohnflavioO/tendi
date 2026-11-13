'use client';

import { useMemo, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_REMINDER_TEMPLATE, MAX_REMINDER_TEMPLATE_LENGTH, REMINDER_LEAD_OPTIONS, REMINDER_VARIABLES, normalizeReminderSettings,
  renderReminder,
} from '@/lib/agenda-reminders';
import { fieldClass, labelClass, type AgendaOrganization } from '@/components/agenda/types';

const leadLabel = (hours: number) => (hours === 24 ? '1 dia antes' : hours === 48 ? '2 dias antes' : `${hours} horas antes`);

/** Lembrete automático por WhatsApp: liga/desliga, antecedência e texto da mensagem. */
export function ReminderSettingsCard({ organization, canManage, professionalLabel, onChanged }: {
  organization: AgendaOrganization;
  canManage: boolean;
  professionalLabel: string;
  onChanged: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const saved = normalizeReminderSettings(organization.agenda_settings);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [hoursBefore, setHoursBefore] = useState(saved.hoursBefore);
  const [template, setTemplate] = useState(saved.template);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = enabled !== saved.enabled || hoursBefore !== saved.hoursBefore || template.trim() !== saved.template;
  const preview = renderReminder(template.trim() || DEFAULT_REMINDER_TEMPLATE, {
    nome: 'Maria', empresa: organization.name, servico: 'Corte', profissional: professionalLabel === 'Barbeiro' ? 'Rafael' : 'Dra. Ana', dia: 'amanhã', hora: '14:30',
  });
  const asksReply = /\b1\b/.test(template) && /\b2\b/.test(template);

  async function save() {
    setSaving(true);
    setMessage(null);
    const current = organization.agenda_settings && typeof organization.agenda_settings === 'object' && !Array.isArray(organization.agenda_settings)
      ? (organization.agenda_settings as Record<string, unknown>)
      : {};
    const next = { ...current, reminders: { enabled, hoursBefore, template: template.trim() || DEFAULT_REMINDER_TEMPLATE } };
    const { data, error } = await supabase.from('organizations').update({ agenda_settings: next }).eq('id', organization.id).select('id');
    setSaving(false);
    if (error) { setMessage({ ok: false, text: `Não foi possível salvar: ${error.message}` }); return; }
    if (!(data ?? []).length) { setMessage({ ok: false, text: 'Só o dono ou um administrador pode alterar os lembretes.' }); return; }
    await onChanged();
    setMessage({ ok: true, text: enabled ? 'Lembretes ligados. Os próximos agendamentos com WhatsApp serão avisados.' : 'Lembretes desligados.' });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-[#E8F4F2] p-2.5 text-[#004751]"><BellRing size={18} /></span>
          <div>
            <h2 className="text-base font-bold text-[#25275B]">Lembrete e confirmação por WhatsApp</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">Antes do horário, o cliente recebe um lembrete e responde 1 para confirmar ou 2 para remarcar. A agenda é atualizada sozinha.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" role="switch" aria-checked={enabled} checked={enabled} disabled={!canManage || saving} onChange={event => setEnabled(event.target.checked)} className="size-4 accent-[#004751]" />
          {enabled ? 'Ligado' : 'Desligado'}
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor="reminder-lead" className={labelClass}>Quando enviar</label>
            <select id="reminder-lead" value={hoursBefore} disabled={!canManage || saving} onChange={event => setHoursBefore(Number(event.target.value))} className={fieldClass}>
              {REMINDER_LEAD_OPTIONS.map(hours => <option key={hours} value={hours}>{leadLabel(hours)}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400">Nada é enviado entre 21h e 8h, nem com menos de 45 minutos para o horário.</p>
          </div>
          <div>
            <label htmlFor="reminder-template" className={labelClass}>Mensagem</label>
            <textarea id="reminder-template" value={template} disabled={!canManage || saving} maxLength={MAX_REMINDER_TEMPLATE_LENGTH} rows={6} onChange={event => setTemplate(event.target.value)} className={`${fieldClass} resize-y leading-6`} />
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
              Você pode usar: {REMINDER_VARIABLES.map(item => `{${item.key}}`).join(', ')}.
              {' '}<button type="button" disabled={!canManage || saving} onClick={() => setTemplate(DEFAULT_REMINDER_TEMPLATE)} className="font-semibold text-[#004751] hover:underline disabled:opacity-40">Usar o texto padrão</button>
            </p>
            {!asksReply && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">O texto não explica as respostas 1 (confirmar) e 2 (remarcar). Sem isso o cliente pode não saber como responder.</p>}
          </div>
        </div>

        <div>
          <p className={labelClass}>Como o cliente vai ver</p>
          <div className="rounded-2xl bg-[#E7F6EC] p-4">
            <p className="whitespace-pre-wrap rounded-xl rounded-tl-sm bg-white px-3.5 py-3 text-[13px] leading-6 text-slate-800 shadow-sm">{preview}</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-[11px] leading-4 text-slate-500">
            <li>• Só recebem o lembrete os agendamentos com WhatsApp preenchido e ainda em &quot;Agendado&quot;.</li>
            <li>• Cada agendamento recebe um lembrete só. Se você mudar o horário, um novo é enviado.</li>
            <li>• Quem pedir para remarcar aparece em destaque na agenda e a conversa vai para a equipe.</li>
            <li>• O WhatsApp da empresa precisa estar conectado. Em conexão por QR Code, muitos envios automáticos aumentam o risco de bloqueio do número.</li>
          </ul>
        </div>
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!canManage || saving || !dirty} onClick={() => void save()} className="flex items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}Salvar lembretes</button>
        {!canManage && <p className="text-xs text-slate-400">Somente dono ou administrador altera os lembretes.</p>}
      </div>
    </section>
  );
}
