'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { BrandLoader } from '@/components/brand-loader';
import { SEGMENT_INFO, formatDayLong, formatDuration, formatPrice, isSegment, localParts, shiftDay } from '@/lib/agenda';

type Organization = { name: string; segment: string; logoUrl: string | null };
type Professional = { id: string; name: string; color: string };
type Service = { id: string; name: string; durationMinutes: number; priceCents: number | null };
type Agenda = { organization: Organization; professionals: Professional[]; services: Service[] };

type Step = 'service' | 'professional' | 'time' | 'contact' | 'done';

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body: body as Record<string, unknown> };
}

export default function PublicAgendaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('service');
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [day, setDay] = useState(() => localParts(new Date()).day);
  const [slots, setSlots] = useState<number[] | null>(null);
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { ok, body } = await readJson(await fetch(`/api/agenda-public/${slug}`));
      if (!active) return;
      if (!ok) { setLoadError(typeof body.error === 'string' ? body.error : 'Agendamento não disponível.'); setLoading(false); return; }
      setAgenda(body as unknown as Agenda);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (step !== 'time' || !serviceId || !professionalId) return;
    let active = true;
    setSlots(null);
    setStartMinutes(null);
    (async () => {
      const params = new URLSearchParams({ professionalId, serviceId, day });
      const { ok, body } = await readJson(await fetch(`/api/agenda-public/${slug}/slots?${params}`));
      if (!active) return;
      setSlots(ok && Array.isArray(body.slots) ? (body.slots as number[]) : []);
    })();
    return () => { active = false; };
  }, [step, slug, serviceId, professionalId, day]);

  const segment = agenda && isSegment(agenda.organization.segment) ? agenda.organization.segment : 'other';
  const customerLabel = SEGMENT_INFO[segment].customer;
  const professionalLabel = SEGMENT_INFO[segment].professional;
  const service = useMemo(() => agenda?.services.find(item => item.id === serviceId) ?? null, [agenda, serviceId]);
  const professional = useMemo(() => agenda?.professionals.find(item => item.id === professionalId) ?? null, [agenda, professionalId]);

  async function submit() {
    setFormError('');
    if (startMinutes === null) return;
    setSubmitting(true);
    const { ok, body } = await readJson(await fetch(`/api/agenda-public/${slug}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professionalId, serviceId, day, startMinutes, customerName: name, customerPhone: phone }),
    }));
    setSubmitting(false);
    if (!ok) { setFormError(typeof body.error === 'string' ? body.error : 'Não foi possível concluir o agendamento.'); return; }
    setStep('done');
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><BrandLoader label="Carregando" /></div>;
  if (loadError || !agenda) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 text-center">
        <p className="text-sm text-slate-500">{loadError || 'Agendamento não disponível.'}</p>
      </div>
    );
  }

  const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-tendi-haze/40 pb-16">
      <header className="border-b border-tendi-line bg-white px-5 py-5 text-center">
        {agenda.organization.logoUrl
          ? <img src={agenda.organization.logoUrl} alt={agenda.organization.name} className="mx-auto h-10 w-auto object-contain" />
          : <p className="td-title text-lg">{agenda.organization.name}</p>}
        <p className="mt-1 text-xs font-semibold uppercase tracking-[.1em] text-slate-400">Agendamento online</p>
      </header>

      <main className="mx-auto mt-6 max-w-md px-5">
        {step !== 'service' && step !== 'done' && (
          <button type="button" onClick={() => setStep(step === 'professional' ? 'service' : step === 'time' ? 'professional' : 'time')} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-tendi-navy">
            <ArrowLeft size={15} />Voltar
          </button>
        )}

        {step === 'service' && (
          <section className="td-card p-5">
            <h1 className="td-title text-base">Escolha o serviço</h1>
            <ul className="mt-4 space-y-2">
              {agenda.services.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => { setServiceId(item.id); setStep('professional'); }} className="flex w-full items-center justify-between rounded-xl border border-tendi-line px-4 py-3 text-left hover:border-tendi-teal hover:bg-tendi-tealsoft/40">
                    <span>
                      <span className="block text-sm font-semibold text-tendi-navy">{item.name}</span>
                      <span className="block text-xs text-slate-400">{formatDuration(item.durationMinutes)}</span>
                    </span>
                    {item.priceCents !== null && <span className="text-sm font-semibold text-tendi-navy">{formatPrice(item.priceCents)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 'professional' && (
          <section className="td-card p-5">
            <h1 className="td-title text-base">Escolha o {professionalLabel.toLowerCase()}</h1>
            <ul className="mt-4 space-y-2">
              {agenda.professionals.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => { setProfessionalId(item.id); setStep('time'); }} className="flex w-full items-center gap-3 rounded-xl border border-tendi-line px-4 py-3 text-left hover:border-tendi-teal hover:bg-tendi-tealsoft/40">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-semibold text-tendi-navy">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 'time' && (
          <section className="td-card p-5">
            <h1 className="td-title text-base">Escolha o dia e o horário</h1>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={() => setDay(current => shiftDay(current, -1))} className="td-btn td-btn-secondary td-btn-sm"><ChevronLeft size={15} /></button>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-tendi-navy"><Calendar size={15} />{formatDayLong(day)}</p>
              <button type="button" onClick={() => setDay(current => shiftDay(current, 1))} className="td-btn td-btn-secondary td-btn-sm"><ChevronRight size={15} /></button>
            </div>

            {slots === null && <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" />Buscando horários…</p>}
            {slots !== null && slots.length === 0 && <p className="mt-6 text-center text-sm text-slate-400">Sem horários livres nesse dia. Tente outro dia.</p>}
            {slots !== null && slots.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {slots.map(minutes => (
                  <button key={minutes} type="button" onClick={() => { setStartMinutes(minutes); setStep('contact'); }} className="rounded-xl border border-tendi-line py-2 text-sm font-semibold text-tendi-navy hover:border-tendi-teal hover:bg-tendi-tealsoft/40">
                    {formatTime(minutes)}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 'contact' && service && professional && startMinutes !== null && (
          <section className="td-card p-5">
            <h1 className="td-title text-base">Seus dados</h1>
            <div className="mt-3 rounded-xl bg-tendi-haze/70 px-4 py-3 text-sm text-slate-600">
              <p><strong className="text-tendi-navy">{service.name}</strong> com {professional.name}</p>
              <p className="mt-0.5">{formatDayLong(day)} às {formatTime(startMinutes)}</p>
            </div>
            <form onSubmit={event => { event.preventDefault(); void submit(); }} className="mt-4 space-y-3">
              <div>
                <label htmlFor="public-name" className="mb-1.5 block text-xs font-semibold text-slate-600">Seu nome</label>
                <input id="public-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required className="td-input" placeholder="Nome completo" />
              </div>
              <div>
                <label htmlFor="public-phone" className="mb-1.5 block text-xs font-semibold text-slate-600">WhatsApp</label>
                <input id="public-phone" value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" required className="td-input" placeholder="(11) 99999-0000" />
                <p className="mt-1.5 text-[11px] text-slate-400">Enviamos a confirmação por aqui.</p>
              </div>
              {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
              <button type="submit" disabled={submitting} className="td-btn td-btn-teal w-full justify-center">{submitting && <Loader2 size={15} className="animate-spin" />}Confirmar {customerLabel === 'Paciente' ? 'consulta' : 'agendamento'}</button>
            </form>
          </section>
        )}

        {step === 'done' && service && professional && startMinutes !== null && (
          <section className="td-card p-6 text-center">
            <span className="td-icon td-icon-teal mx-auto flex size-12 items-center justify-center"><Check size={22} /></span>
            <h1 className="td-title mt-3 text-base">Agendamento confirmado!</h1>
            <p className="mt-2 text-sm text-slate-600">{service.name} com {professional.name}, {formatDayLong(day)} às {formatTime(startMinutes)}.</p>
            <p className="mt-1 text-xs text-slate-400">Você vai receber a confirmação pelo WhatsApp.</p>
          </section>
        )}
      </main>
    </div>
  );
}
