'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_WEEK_HOURS, PROFESSIONAL_COLORS, SEGMENTS, SEGMENT_INFO, WEEKDAY_LABELS, formatDuration, formatPrice, isSegment,
  minutesOf, parsePrice, type Segment,
} from '@/lib/agenda';
import { fieldClass, labelClass, type AgendaOrganization, type HoursRow, type Professional, type Service } from '@/components/agenda/types';

const timeClass = 'w-[104px] rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#7C7EC0]';

type DayForm = { open: boolean; starts: string; ends: string; breakStarts: string; breakEnds: string };

const hhmm = (value: string) => value.slice(0, 5);

/** Linhas do banco (um ou dois turnos por dia) -> formulário de um dia: horário e intervalo. */
function toDayForm(rows: HoursRow[]): DayForm {
  const sorted = [...rows].sort((a, b) => a.starts.localeCompare(b.starts));
  if (!sorted.length) return { open: false, starts: '09:00', ends: '18:00', breakStarts: '', breakEnds: '' };
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return sorted.length === 1
    ? { open: true, starts: hhmm(first.starts), ends: hhmm(first.ends), breakStarts: '', breakEnds: '' }
    : { open: true, starts: hhmm(first.starts), ends: hhmm(last.ends), breakStarts: hhmm(first.ends), breakEnds: hhmm(last.starts) };
}

/** Configuração da agenda: segmento, profissionais com horários e serviços. */
export function AgendaSettings({ organization, professionals, services, hours, canManage, professionalLabel, onChanged }: {
  organization: AgendaOrganization;
  professionals: Professional[];
  services: Service[];
  hours: HoursRow[];
  canManage: boolean;
  professionalLabel: string;
  onChanged: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newProfessional, setNewProfessional] = useState('');
  const [newService, setNewService] = useState({ name: '', duration: '30', price: '' });
  const [editingHours, setEditingHours] = useState<{ professionalId: string; days: DayForm[] } | null>(null);
  const segment: Segment | '' = isSegment(organization.business_segment) ? organization.business_segment : '';

  async function run(key: string, action: () => Promise<{ error: { message: string } | null } | void>, success?: string) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      if (result && result.error) throw new Error(result.error.message);
      await onChanged();
      if (success) setMessage({ ok: true, text: success });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível salvar.' });
    } finally { setBusy(''); }
  }

  const saveSegment = (value: string) => run('segment', async () => {
    const { data, error } = await supabase.from('organizations').update({ business_segment: value || null }).eq('id', organization.id).select('id');
    if (!error && !(data ?? []).length) return { error: { message: 'Só o dono ou um administrador pode mudar o segmento.' } };
    return { error };
  }, 'Segmento salvo.');

  const addPresetServices = () => run('preset', async () => {
    if (!segment) return;
    const existing = new Set(services.map(service => service.name.trim().toLowerCase()));
    const rows = SEGMENT_INFO[segment].services
      .filter(service => !existing.has(service.name.toLowerCase()))
      .map(service => ({ organization_id: organization.id, name: service.name, duration_minutes: service.duration, price_cents: service.priceCents }));
    if (!rows.length) return { error: { message: 'Os serviços do modelo já estão cadastrados.' } };
    return supabase.from('agenda_services').insert(rows);
  }, 'Serviços do modelo adicionados. Ajuste a duração e o valor de cada um.');

  const addProfessional = () => run('professional', async () => {
    const name = newProfessional.trim();
    if (!name) return { error: { message: 'Informe o nome.' } };
    const color = PROFESSIONAL_COLORS[professionals.length % PROFESSIONAL_COLORS.length];
    const created = await supabase.from('agenda_professionals').insert({ organization_id: organization.id, name, color, position: professionals.length }).select('id').single();
    if (created.error) return created;
    const hoursResult = await supabase.from('agenda_hours').insert(DEFAULT_WEEK_HOURS.map(row => ({ ...row, organization_id: organization.id, professional_id: created.data.id })));
    if (!hoursResult.error) setNewProfessional('');
    return hoursResult;
  }, 'Profissional adicionado com horário de segunda a sábado, 09:00 às 18:00.');

  const toggleProfessional = (professional: Professional) => run(`p-${professional.id}`, () =>
    supabase.from('agenda_professionals').update({ is_active: !professional.is_active }).eq('id', professional.id).eq('organization_id', organization.id));

  const addService = () => run('service', async () => {
    const name = newService.name.trim();
    const duration = Number(newService.duration);
    const price = parsePrice(newService.price);
    if (!name) return { error: { message: 'Informe o nome do serviço.' } };
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) return { error: { message: 'A duração deve ficar entre 5 e 480 minutos.' } };
    if (Number.isNaN(price)) return { error: { message: 'Valor inválido. Use o formato 49,90.' } };
    const result = await supabase.from('agenda_services').insert({ organization_id: organization.id, name, duration_minutes: duration, price_cents: price });
    if (!result.error) setNewService({ name: '', duration: '30', price: '' });
    return result;
  });

  const toggleService = (service: Service) => run(`s-${service.id}`, () =>
    supabase.from('agenda_services').update({ is_active: !service.is_active }).eq('id', service.id).eq('organization_id', organization.id));

  function openHours(professionalId: string) {
    setMessage(null);
    setEditingHours({
      professionalId,
      days: WEEKDAY_LABELS.map((_, weekday) => toDayForm(hours.filter(row => row.professional_id === professionalId && row.weekday === weekday))),
    });
  }

  const saveHours = () => run('hours', async () => {
    if (!editingHours) return;
    const rows: Array<Omit<HoursRow, 'id'> & { organization_id: string }> = [];
    for (const [weekday, form] of editingHours.days.entries()) {
      if (!form.open) continue;
      const start = minutesOf(form.starts);
      const end = minutesOf(form.ends);
      const label = WEEKDAY_LABELS[weekday];
      if (start === null || end === null || end <= start) return { error: { message: `${label}: o fim precisa ser depois do início.` } };
      const base = { organization_id: organization.id, professional_id: editingHours.professionalId, weekday };
      if (form.breakStarts || form.breakEnds) {
        const breakStart = minutesOf(form.breakStarts);
        const breakEnd = minutesOf(form.breakEnds);
        if (breakStart === null || breakEnd === null || breakStart <= start || breakEnd <= breakStart || breakEnd >= end) {
          return { error: { message: `${label}: o intervalo precisa ficar dentro do horário de atendimento.` } };
        }
        rows.push({ ...base, starts: form.starts, ends: form.breakStarts }, { ...base, starts: form.breakEnds, ends: form.ends });
      } else rows.push({ ...base, starts: form.starts, ends: form.ends });
    }
    const removed = await supabase.from('agenda_hours').delete().eq('organization_id', organization.id).eq('professional_id', editingHours.professionalId);
    if (removed.error) return removed;
    const inserted = rows.length ? await supabase.from('agenda_hours').insert(rows) : { error: null };
    if (!inserted.error) setEditingHours(null);
    return inserted;
  }, 'Horários salvos.');

  const setDay = (weekday: number, patch: Partial<DayForm>) =>
    setEditingHours(current => current && { ...current, days: current.days.map((form, index) => (index === weekday ? { ...form, ...patch } : form)) });

  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
  const smallButton = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40';
  const primaryButton = 'flex items-center justify-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-40';

  return (
    <div className="space-y-5">
      {!canManage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Somente dono, administrador ou supervisor altera a configuração da agenda.</p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <section className={card}>
        <h2 className="text-base font-bold text-[#25275B]">Tipo de negócio</h2>
        <p className="mt-1 text-sm text-slate-500">Ajusta os nomes usados na agenda e oferece uma lista inicial de serviços.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="agenda-segment" className={labelClass}>Segmento</label>
            <select id="agenda-segment" value={segment} disabled={!canManage || busy === 'segment'} onChange={event => void saveSegment(event.target.value)} className={fieldClass}>
              <option value="">Selecione</option>
              {SEGMENTS.map(item => <option key={item} value={item}>{SEGMENT_INFO[item].label}</option>)}
            </select>
          </div>
          {segment && SEGMENT_INFO[segment].services.length > 0 && <button type="button" disabled={!canManage || busy === 'preset'} onClick={() => void addPresetServices()} className={smallButton + ' py-2.5'}>Adicionar serviços do modelo</button>}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-base font-bold text-[#25275B]">{professionalLabel === 'Barbeiro' ? 'Barbeiros' : 'Profissionais'}</h2>
        <p className="mt-1 text-sm text-slate-500">Cada pessoa tem a sua coluna na agenda e o seu horário de atendimento.</p>
        <ul className="mt-4 divide-y divide-slate-100">
          {professionals.map(professional => {
            const days = WEEKDAY_LABELS.map((label, weekday) => ({ label, open: hours.some(row => row.professional_id === professional.id && row.weekday === weekday) }));
            return (
              <li key={professional.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: professional.color }} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${professional.is_active ? 'text-[#25275B]' : 'text-slate-400 line-through'}`}>{professional.name}</p>
                  <p className="text-[11px] text-slate-400">{days.filter(day => day.open).map(day => day.label.slice(0, 3)).join(' · ') || 'Sem horário de atendimento'}</p>
                </div>
                <button type="button" disabled={!canManage} onClick={() => openHours(professional.id)} className={smallButton}>Horários</button>
                <button type="button" disabled={!canManage || busy === `p-${professional.id}`} onClick={() => void toggleProfessional(professional)} className={smallButton}>{professional.is_active ? 'Desativar' : 'Reativar'}</button>
              </li>
            );
          })}
          {!professionals.length && <li className="py-3 text-sm text-slate-400">Nenhum cadastrado ainda. Adicione o primeiro abaixo.</li>}
        </ul>
        <form onSubmit={event => { event.preventDefault(); void addProfessional(); }} className="mt-3 flex flex-wrap gap-2">
          <input value={newProfessional} onChange={event => setNewProfessional(event.target.value)} disabled={!canManage} maxLength={80} placeholder={`Nome do ${professionalLabel.toLowerCase()}`} aria-label={`Nome do ${professionalLabel.toLowerCase()}`} className={`${fieldClass} min-w-[200px] flex-1`} />
          <button disabled={!canManage || busy === 'professional'} className={primaryButton}>{busy === 'professional' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Adicionar</button>
        </form>

        {editingHours && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-[#FBFCFE] p-4">
            <p className="text-sm font-bold text-[#25275B]">Horário de {professionals.find(item => item.id === editingHours.professionalId)?.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">Marque os dias de atendimento. O intervalo (almoço) é opcional.</p>
            <div className="mt-3 space-y-2">
              {editingHours.days.map((form, weekday) => (
                <div key={weekday} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-28 items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.open} onChange={event => setDay(weekday, { open: event.target.checked })} className="size-4 accent-[#004751]" />{WEEKDAY_LABELS[weekday]}</label>
                  {form.open ? <>
                    <input type="time" value={form.starts} onChange={event => setDay(weekday, { starts: event.target.value })} aria-label={`${WEEKDAY_LABELS[weekday]}: início`} className={timeClass} />
                    <span className="text-xs text-slate-400">às</span>
                    <input type="time" value={form.ends} onChange={event => setDay(weekday, { ends: event.target.value })} aria-label={`${WEEKDAY_LABELS[weekday]}: fim`} className={timeClass} />
                    <span className="ml-2 text-xs text-slate-400">intervalo</span>
                    <input type="time" value={form.breakStarts} onChange={event => setDay(weekday, { breakStarts: event.target.value })} aria-label={`${WEEKDAY_LABELS[weekday]}: início do intervalo`} className={timeClass} />
                    <span className="text-xs text-slate-400">às</span>
                    <input type="time" value={form.breakEnds} onChange={event => setDay(weekday, { breakEnds: event.target.value })} aria-label={`${WEEKDAY_LABELS[weekday]}: fim do intervalo`} className={timeClass} />
                  </> : <span className="text-xs text-slate-400">Não atende</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy === 'hours'} onClick={() => void saveHours()} className={primaryButton}>{busy === 'hours' && <Loader2 size={15} className="animate-spin" />}Salvar horários</button>
              <button type="button" disabled={busy === 'hours'} onClick={() => setEditingHours(null)} className={smallButton + ' px-4'}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-base font-bold text-[#25275B]">Serviços</h2>
        <p className="mt-1 text-sm text-slate-500">A duração define os horários livres oferecidos ao agendar.</p>
        <ul className="mt-4 divide-y divide-slate-100">
          {services.map(service => (
            <li key={service.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${service.is_active ? 'text-[#25275B]' : 'text-slate-400 line-through'}`}>{service.name}</p>
                <p className="text-[11px] text-slate-400">{formatDuration(service.duration_minutes)}{service.price_cents !== null ? ` · ${formatPrice(service.price_cents)}` : ''}</p>
              </div>
              <button type="button" disabled={!canManage || busy === `s-${service.id}`} onClick={() => void toggleService(service)} className={smallButton}>{service.is_active ? <span className="flex items-center gap-1"><Trash2 size={12} />Desativar</span> : 'Reativar'}</button>
            </li>
          ))}
          {!services.length && <li className="py-3 text-sm text-slate-400">Nenhum serviço cadastrado ainda.</li>}
        </ul>
        <form onSubmit={event => { event.preventDefault(); void addService(); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_130px_auto]">
          <input value={newService.name} onChange={event => setNewService({ ...newService, name: event.target.value })} disabled={!canManage} maxLength={80} placeholder="Nome do serviço" aria-label="Nome do serviço" className={fieldClass} />
          <input type="number" min={5} max={480} step={5} value={newService.duration} onChange={event => setNewService({ ...newService, duration: event.target.value })} disabled={!canManage} aria-label="Duração em minutos" title="Duração em minutos" className={fieldClass} />
          <input value={newService.price} onChange={event => setNewService({ ...newService, price: event.target.value })} disabled={!canManage} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor em reais" className={fieldClass} />
          <button disabled={!canManage || busy === 'service'} className={primaryButton}>{busy === 'service' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Adicionar</button>
        </form>
      </section>
    </div>
  );
}
