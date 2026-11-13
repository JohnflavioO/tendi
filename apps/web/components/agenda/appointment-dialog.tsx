'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  STATUS_INFO, dayRange, formatMinutes, formatPrice, freeSlots, isBlockingStatus, localParts, minutesOf, normalizePhone,
  overlaps, parsePrice, weekdayOf, withinHours, zonedToUtc, type AppointmentStatus,
} from '@/lib/agenda';
import {
  APPOINTMENT_COLUMNS, fieldClass, labelClass, shiftsFor, type Appointment, type HoursRow, type Professional, type Service,
} from '@/components/agenda/types';

type ContactHit = { id: string; full_name: string; phone_e164: string | null };

export type AppointmentDraft = { appointment?: Appointment; professionalId?: string; day: string; minutes?: number };

const STATUS_ACTIONS: Array<{ status: AppointmentStatus; label: string; className: string }> = [
  { status: 'confirmed', label: 'Confirmar', className: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
  { status: 'completed', label: 'Atendido', className: 'border-slate-300 text-slate-700 hover:bg-slate-50' },
  { status: 'no_show', label: 'Faltou', className: 'border-rose-200 text-rose-700 hover:bg-rose-50' },
  { status: 'cancelled', label: 'Cancelar', className: 'border-slate-200 text-slate-500 hover:bg-slate-50' },
];

/** Criar ou editar um agendamento: cliente, serviço, profissional, dia, horário e situação. */
export function AppointmentDialog({ draft, organizationId, timeZone, professionals, services, hours, customerLabel, professionalLabel, userId, onClose, onSaved }: {
  draft: AppointmentDraft;
  organizationId: string;
  timeZone: string;
  professionals: Professional[];
  services: Service[];
  hours: HoursRow[];
  customerLabel: string;
  professionalLabel: string;
  userId: string;
  onClose: () => void;
  onSaved: (day: string) => void;
}) {
  const supabase = useMemo(() => createClient() as any, []);
  const editing = draft.appointment ?? null;
  const initial = editing ? localParts(editing.starts_at, timeZone) : null;
  const initialDuration = editing ? Math.max(5, Math.round((Date.parse(editing.ends_at) - Date.parse(editing.starts_at)) / 60_000)) : null;

  const [name, setName] = useState(editing?.customer_name ?? '');
  const [phone, setPhone] = useState(editing?.customer_phone ?? '');
  const [contactId, setContactId] = useState<string | null>(editing?.contact_id ?? null);
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [serviceId, setServiceId] = useState(editing?.service_id ?? (editing ? '' : services[0]?.id ?? ''));
  const [duration, setDuration] = useState(String(initialDuration ?? services[0]?.duration_minutes ?? 30));
  const [price, setPrice] = useState(editing ? (editing.price_cents !== null ? (editing.price_cents / 100).toFixed(2).replace('.', ',') : '') : (services[0]?.price_cents != null ? (services[0].price_cents / 100).toFixed(2).replace('.', ',') : ''));
  const [professionalId, setProfessionalId] = useState(editing?.professional_id ?? draft.professionalId ?? professionals[0]?.id ?? '');
  const [day, setDay] = useState(initial?.day ?? draft.day);
  const [time, setTime] = useState(formatMinutes(initial?.minutes ?? draft.minutes ?? 9 * 60));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [busy, setBusy] = useState<Array<{ id: string; start: number; end: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Sugestões de contatos já cadastrados (para ligar o agendamento à conversa do WhatsApp).
  useEffect(() => {
    const term = name.trim();
    if (contactId || term.length < 2) { setHits([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      void supabase.from('contacts').select('id,full_name,phone_e164')
        .eq('organization_id', organizationId).ilike('full_name', `%${term.replace(/[%_\\]/g, '')}%`).limit(5)
        .then(({ data }: any) => { if (active) setHits((data ?? []) as ContactHit[]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [name, contactId, organizationId, supabase]);

  // Horários já ocupados do profissional no dia escolhido.
  useEffect(() => {
    if (!professionalId || !day) { setBusy([]); return; }
    let active = true;
    const range = dayRange(day, timeZone);
    void supabase.from('appointments').select('id,starts_at,ends_at,status')
      .eq('organization_id', organizationId).eq('professional_id', professionalId)
      .lt('starts_at', range.to.toISOString()).gt('ends_at', range.from.toISOString())
      .then(({ data }: any) => {
        if (!active) return;
        setBusy(((data ?? []) as Array<{ id: string; starts_at: string; ends_at: string; status: string }>)
          .filter(row => isBlockingStatus(row.status))
          .map(row => {
            const start = localParts(row.starts_at, timeZone);
            const end = localParts(row.ends_at, timeZone);
            return { id: row.id, start: start.day === day ? start.minutes : 0, end: end.day === day ? end.minutes : 24 * 60 };
          }));
      });
    return () => { active = false; };
  }, [professionalId, day, organizationId, timeZone, supabase]);

  const durationMinutes = Number(duration);
  const validDuration = Number.isInteger(durationMinutes) && durationMinutes >= 5 && durationMinutes <= 480;
  const shifts = shiftsFor(hours, professionalId, weekdayOf(day));
  const others = busy.filter(item => item.id !== editing?.id);
  const today = localParts(new Date(), timeZone);
  const suggestions = validDuration ? freeSlots({ hours: shifts, busy: others, duration: durationMinutes, earliest: day === today.day ? today.minutes : undefined }) : [];
  const startMinutes = minutesOf(time);
  const candidate = startMinutes !== null && validDuration ? { start: startMinutes, end: startMinutes + durationMinutes } : null;
  const conflict = candidate ? others.some(item => overlaps(candidate, item)) : false;
  const outsideHours = candidate ? !withinHours(candidate, shifts) : false;

  function pickService(id: string) {
    setServiceId(id);
    const service = services.find(item => item.id === id);
    if (service) {
      setDuration(String(service.duration_minutes));
      setPrice(service.price_cents !== null ? (service.price_cents / 100).toFixed(2).replace('.', ',') : '');
    }
  }

  async function save(nextStatus?: AppointmentStatus) {
    setError('');
    const customerName = name.trim();
    if (!customerName) { setError(`Informe o nome do ${customerLabel.toLowerCase()}.`); return; }
    const phoneValue = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !phoneValue) { setError('Telefone inválido. Use DDD + número, como (85) 99999-0000.'); return; }
    if (!professionalId) { setError(`Escolha o ${professionalLabel.toLowerCase()}.`); return; }
    if (!validDuration) { setError('A duração deve ficar entre 5 e 480 minutos.'); return; }
    if (startMinutes === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) { setError('Informe o dia e o horário.'); return; }
    if (startMinutes + durationMinutes > 24 * 60) { setError('O atendimento precisa terminar no mesmo dia.'); return; }
    const priceCents = parsePrice(price);
    if (Number.isNaN(priceCents)) { setError('Valor inválido. Use o formato 49,90.'); return; }
    const status = nextStatus ?? editing?.status ?? 'scheduled';
    if (conflict && isBlockingStatus(status)) { setError('Esse horário já está ocupado para este profissional.'); return; }

    const service = services.find(item => item.id === serviceId) ?? null;
    const startsAt = zonedToUtc(day, startMinutes, timeZone);
    const row = {
      professional_id: professionalId,
      service_id: service?.id ?? null,
      service_name: service?.name ?? editing?.service_name ?? null,
      contact_id: contactId,
      customer_name: customerName,
      customer_phone: phoneValue,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + durationMinutes * 60_000).toISOString(),
      status,
      notes: notes.trim() || null,
      price_cents: priceCents,
      ...(status === 'confirmed' && editing?.status !== 'confirmed' ? { confirmed_at: new Date().toISOString() } : {}),
    };

    setSaving(true);
    const result = editing
      ? await supabase.from('appointments').update(row).eq('id', editing.id).eq('organization_id', organizationId).select(APPOINTMENT_COLUMNS).maybeSingle()
      : await supabase.from('appointments').insert({ ...row, organization_id: organizationId, source: 'manual', created_by: userId }).select(APPOINTMENT_COLUMNS).maybeSingle();
    setSaving(false);
    if (result.error) {
      // 23P01 = o banco recusou porque outro agendamento ocupou o horário nesse meio-tempo.
      setError(result.error.code === '23P01' ? 'Esse horário acabou de ser ocupado. Escolha outro.' : `Não foi possível salvar: ${result.error.message}`);
      return;
    }
    onSaved(day);
  }

  const currentStatus = editing?.status ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={editing ? 'Editar agendamento' : 'Novo agendamento'} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#25275B]">{editing ? 'Agendamento' : 'Novo agendamento'}</h2>
            {currentStatus && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><span className={`size-2 rounded-full ${STATUS_INFO[currentStatus].dot}`} />{STATUS_INFO[currentStatus].label}{editing?.source === 'ai' ? ' · marcado pela IA' : ''}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 disabled:opacity-40"><X size={18} /></button>
        </header>

        <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <label htmlFor="appointment-name" className={labelClass}>{customerLabel}</label>
              <input id="appointment-name" ref={nameRef} value={name} onChange={event => { setName(event.target.value); setContactId(null); }} autoComplete="off" maxLength={120} placeholder="Nome" className={fieldClass} />
              {hits.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {hits.map(hit => (
                    <li key={hit.id}><button type="button" onClick={() => { setName(hit.full_name); setPhone(hit.phone_e164 ?? ''); setContactId(hit.id); setHits([]); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50"><span className="block truncate text-sm font-semibold text-[#25275B]">{hit.full_name}</span><span className="block text-[11px] text-slate-400">{hit.phone_e164 ?? 'Sem telefone'}</span></button></li>
                  ))}
                </ul>
              )}
              {contactId && <p className="mt-1 text-[11px] text-emerald-700">Ligado ao contato do Tendi</p>}
            </div>
            <div>
              <label htmlFor="appointment-phone" className={labelClass}>WhatsApp (opcional)</label>
              <input id="appointment-phone" value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" autoComplete="off" placeholder="(85) 99999-0000" className={fieldClass} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_110px_120px]">
            <div>
              <label htmlFor="appointment-service" className={labelClass}>Serviço</label>
              <select id="appointment-service" value={serviceId} onChange={event => pickService(event.target.value)} className={fieldClass}>
                <option value="">{editing?.service_name && !editing.service_id ? editing.service_name : 'Outro'}</option>
                {services.filter(service => service.is_active || service.id === serviceId).map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="appointment-duration" className={labelClass}>Duração (min)</label>
              <input id="appointment-duration" type="number" min={5} max={480} step={5} value={duration} onChange={event => setDuration(event.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="appointment-price" className={labelClass}>Valor (R$)</label>
              <input id="appointment-price" value={price} onChange={event => setPrice(event.target.value)} inputMode="decimal" placeholder="0,00" className={fieldClass} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_150px_110px]">
            <div>
              <label htmlFor="appointment-professional" className={labelClass}>{professionalLabel}</label>
              <select id="appointment-professional" value={professionalId} onChange={event => setProfessionalId(event.target.value)} className={fieldClass}>
                {professionals.filter(item => item.is_active || item.id === professionalId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="appointment-day" className={labelClass}>Dia</label>
              <input id="appointment-day" type="date" value={day} onChange={event => setDay(event.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="appointment-time" className={labelClass}>Horário</label>
              <input id="appointment-time" type="time" step={300} value={time} onChange={event => setTime(event.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <p className={labelClass}>Horários livres</p>
            {suggestions.length ? (
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {suggestions.map(slot => {
                  const label = formatMinutes(slot);
                  return <button key={slot} type="button" onClick={() => setTime(label)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${time === label ? 'border-[#004751] bg-[#004751] text-white' : 'border-slate-200 text-slate-600 hover:border-[#004751] hover:text-[#004751]'}`}>{label}</button>;
                })}
              </div>
            ) : <p className="text-xs text-slate-400">{shifts.length ? 'Nenhum horário livre neste dia para essa duração.' : `Este ${professionalLabel.toLowerCase()} não atende neste dia da semana.`}</p>}
            {conflict && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">Esse horário já está ocupado.</p>}
            {!conflict && outsideHours && candidate && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Fora do horário de atendimento. Você pode salvar como encaixe.</p>}
          </div>

          <div>
            <label htmlFor="appointment-notes" className={labelClass}>Observações (opcional)</label>
            <textarea id="appointment-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={2} className={`${fieldClass} resize-none`} />
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {editing && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              {STATUS_ACTIONS.filter(action => action.status !== currentStatus).map(action => (
                <button key={action.status} type="button" disabled={saving} onClick={() => void save(action.status)} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${action.className}`}>{action.label}</button>
              ))}
              {currentStatus && currentStatus !== 'scheduled' && <button type="button" disabled={saving} onClick={() => void save('scheduled')} className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-40">Voltar para agendado</button>}
              {editing.contact_id && <a href={`/inbox?contact=${editing.contact_id}`} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#004751] hover:bg-slate-50"><MessageCircle size={14} />Abrir conversa</a>}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-400">{price.trim() && !Number.isNaN(parsePrice(price)) ? formatPrice(parsePrice(price)) : ''}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Fechar</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#004751] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#003B44] disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}{editing ? 'Salvar alterações' : 'Agendar'}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
