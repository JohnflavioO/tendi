'use client';

import { useMemo, useState } from 'react';
import { Award, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LOYALTY_POINTS_OPTIONS, normalizeLoyaltySettings } from '@/lib/loyalty';
import { labelClass, type AgendaOrganization } from '@/components/agenda/types';

/** Fidelidade por pontos: liga/desliga e quantos pontos o cliente ganha por atendimento concluído. */
export function LoyaltySettingsCard({ organization, canManage, customerLabel, onChanged }: {
  organization: AgendaOrganization;
  canManage: boolean;
  customerLabel: string;
  onChanged: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const saved = normalizeLoyaltySettings(organization.agenda_settings);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [pointsPerVisit, setPointsPerVisit] = useState(saved.pointsPerVisit);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = enabled !== saved.enabled || pointsPerVisit !== saved.pointsPerVisit;

  async function save() {
    setSaving(true);
    setMessage(null);
    const current = organization.agenda_settings && typeof organization.agenda_settings === 'object' && !Array.isArray(organization.agenda_settings)
      ? (organization.agenda_settings as Record<string, unknown>)
      : {};
    const next = { ...current, loyalty: { enabled, pointsPerVisit } };
    const { data, error } = await supabase.from('organizations').update({ agenda_settings: next }).eq('id', organization.id).select('id');
    setSaving(false);
    if (error) { setMessage({ ok: false, text: `Não foi possível salvar: ${error.message}` }); return; }
    if (!(data ?? []).length) { setMessage({ ok: false, text: 'Só o dono ou um administrador pode alterar a fidelidade.' }); return; }
    await onChanged();
    setMessage({ ok: true, text: enabled ? 'Fidelidade ligada. Marcar um atendimento como "Atendido" já credita os pontos.' : 'Fidelidade desligada.' });
  }

  return (
    <section className="td-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="td-icon td-icon-magenta"><Award size={18} /></span>
          <div>
            <h2 className="td-title text-base">Fidelidade por pontos</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">Quando a equipe marca um atendimento como &quot;Atendido&quot;, o {customerLabel === 'Paciente' ? 'paciente' : 'cliente'} ganha pontos automaticamente. Nunca credita duas vezes o mesmo atendimento.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" role="switch" aria-checked={enabled} checked={enabled} disabled={!canManage || saving} onChange={event => setEnabled(event.target.checked)} className="size-4 accent-tendi-teal" />
          {enabled ? 'Ligado' : 'Desligado'}
        </label>
      </div>

      <div className="mt-5 max-w-xs">
        <label htmlFor="loyalty-points" className={labelClass}>Pontos por atendimento concluído</label>
        <select id="loyalty-points" value={pointsPerVisit} disabled={!canManage || saving} onChange={event => setPointsPerVisit(Number(event.target.value))} className="td-input">
          {LOYALTY_POINTS_OPTIONS.map(points => <option key={points} value={points}>{points} pontos</option>)}
        </select>
      </div>

      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!canManage || saving || !dirty} onClick={() => void save()} className="td-btn td-btn-teal disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}Salvar fidelidade</button>
        {!canManage && <p className="text-xs text-slate-400">Somente dono ou administrador altera a fidelidade.</p>}
      </div>
    </section>
  );
}
