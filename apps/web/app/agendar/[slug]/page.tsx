'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Briefcase, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Flower2, Loader2, MapPin, MessageCircle, Scissors, ShieldCheck, Stethoscope,
} from 'lucide-react';
import { BrandLoader } from '@/components/brand-loader';
import { SEGMENT_INFO, formatDayLong, formatDuration, formatPrice, isSegment, localParts, shiftDay } from '@/lib/agenda';

type Organization = { name: string; segment: string; logoUrl: string | null; address: string | null };
type Professional = { id: string; name: string; color: string };
type Service = { id: string; name: string; durationMinutes: number; priceCents: number | null };
type Agenda = { organization: Organization; professionals: Professional[]; services: Service[] };

type Step = 'intro' | 'service' | 'professional' | 'time' | 'contact' | 'done';

const STEP_ORDER: Step[] = ['service', 'professional', 'time', 'contact'];

/** Ícone por segmento: reforça o tipo de negócio na tela de entrada, igual à configuração interna. */
const SEGMENT_ICON: Record<string, typeof Scissors> = {
  barbershop: Scissors, clinic: Stethoscope, beauty: Flower2, other: Briefcase,
};
/** Cor de destaque do ícone por segmento (mesmas cores da marca, não tons genéricos de IA). */
const SEGMENT_ACCENT: Record<string, { bg: string; fg: string }> = {
  barbershop: { bg: 'bg-tendi-teal', fg: 'text-white' },
  clinic: { bg: 'bg-tendi-magenta', fg: 'text-white' },
  beauty: { bg: 'bg-tendi-magenta', fg: 'text-white' },
  other: { bg: 'bg-white/10', fg: 'text-white' },
};

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body: body as Record<string, unknown> };
}

export default function PublicAgendaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('intro');
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
  const SegmentIcon = SEGMENT_ICON[segment] ?? Briefcase;
  const service = useMemo(() => agenda?.services.find(item => item.id === serviceId) ?? null, [agenda, serviceId]);
  const professional = useMemo(() => agenda?.professionals.find(item => item.id === professionalId) ?? null, [agenda, professionalId]);
  const stepNumber = STEP_ORDER.indexOf(step) + 1;

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
  const goBack = () => setStep(step === 'professional' ? 'service' : step === 'time' ? 'professional' : step === 'contact' ? 'time' : 'service');

  return (
    <div className="min-h-screen bg-tendi-haze/40 pb-16">
      {step === 'intro' ? (
        <header className="flex min-h-screen flex-col items-center justify-center bg-white px-5 py-12 text-center">
          <div className="mx-auto w-full max-w-sm">
            {agenda.organization.logoUrl
              ? <img src={agenda.organization.logoUrl} alt={agenda.organization.name} className="mx-auto h-14 w-auto object-contain" />
              : <span className={`mx-auto flex size-14 items-center justify-center rounded-2xl ${SEGMENT_ACCENT[segment]?.bg} ${SEGMENT_ACCENT[segment]?.fg}`}><SegmentIcon size={24} /></span>}
            <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-tendi-line bg-tendi-haze px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">Agendamento online</p>
            <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight text-tendi-navy">{agenda.organization.name}</h1>
            <p className="mt-2 text-sm text-slate-500">Agende seu horário em poucos cliques, sem precisar ligar</p>
            {agenda.organization.address && (
              <a href={mapsUrl(agenda.organization.address)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-tendi-teal underline decoration-tendi-teal/30 underline-offset-2 hover:text-tendi-navy">
                <MapPin size={13} />{agenda.organization.address}
              </a>
            )}
            <button type="button" onClick={() => setStep('service')} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-tendi-navy px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#13153a]">
              Quero agendar<ArrowRight size={16} />
            </button>
            <ul className="mx-auto mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-400">
              <li className="flex items-center gap-1.5"><ShieldCheck size={13} />Sem conta, sem senha</li>
              <li className="flex items-center gap-1.5"><MessageCircle size={13} />Confirmação no WhatsApp</li>
              <li className="flex items-center gap-1.5"><Clock size={13} />Leva menos de 1 minuto</li>
            </ul>

            {agenda.services.length > 0 && (
              <div className="mt-8 rounded-2xl border border-tendi-line bg-tendi-haze/50 p-4 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[.1em] text-slate-400">Serviços disponíveis</p>
                <ul className="mt-2.5 divide-y divide-tendi-line/70">
                  {agenda.services.slice(0, 3).map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-tendi-navy">{item.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{formatDuration(item.durationMinutes)}{item.priceCents !== null ? ` · ${formatPrice(item.priceCents)}` : ''}</span>
                    </li>
                  ))}
                </ul>
                {agenda.services.length > 3 && <p className="mt-2 text-xs text-slate-400">+{agenda.services.length - 3} outro{agenda.services.length - 3 > 1 ? 's' : ''} serviço{agenda.services.length - 3 > 1 ? 's' : ''}</p>}
              </div>
            )}
          </div>
        </header>
      ) : (
        <header className="border-b border-tendi-line bg-white px-5 py-5 text-center">
          {agenda.organization.logoUrl
            ? <img src={agenda.organization.logoUrl} alt={agenda.organization.name} className="mx-auto h-10 w-auto object-contain" />
            : <p className="td-title text-lg">{agenda.organization.name}</p>}
          <p className="mt-1 text-xs font-semibold uppercase tracking-[.1em] text-slate-400">Agendamento online</p>
        </header>
      )}

      {step !== 'intro' && step !== 'done' && (
        <div className="mx-auto mt-5 flex max-w-md items-center gap-1.5 px-5">
          {STEP_ORDER.map((_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < stepNumber ? 'bg-tendi-teal' : 'bg-tendi-line'}`} />)}
        </div>
      )}

      <main className={step === 'intro' ? '' : 'mx-auto mt-4 max-w-md px-5'}>
        {step !== 'intro' && step !== 'service' && step !== 'done' && (
          <button type="button" onClick={goBack} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-tendi-navy">
            <ArrowLeft size={15} />Voltar
          </button>
        )}

        {step === 'service' && (
          <section className="td-card p-5">
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-tendi-teal">Passo {stepNumber} de {STEP_ORDER.length}</p>
            <h2 className="td-title mt-1 text-base">Escolha o serviço</h2>
            <ul className="mt-4 space-y-2">
              {agenda.services.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => { setServiceId(item.id); setStep('professional'); }} className="group flex w-full items-center gap-3 rounded-xl border border-tendi-line px-4 py-3.5 text-left transition hover:border-tendi-teal hover:bg-tendi-tealsoft/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tendi-tealsoft text-tendi-teal"><SegmentIcon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-tendi-navy">{item.name}</span>
                      <span className="block text-xs text-slate-400">{formatDuration(item.durationMinutes)}</span>
                    </span>
                    {item.priceCents !== null
                      ? <span className="shrink-0 text-sm font-bold text-tendi-navy">{formatPrice(item.priceCents)}</span>
                      : <span className="shrink-0 text-xs font-medium italic text-slate-400">Sob consulta</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 'professional' && (
          <section className="td-card p-5">
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-tendi-teal">Passo {stepNumber} de {STEP_ORDER.length}</p>
            <h2 className="td-title mt-1 text-base">Escolha o {professionalLabel.toLowerCase()}</h2>
            <ul className="mt-4 space-y-2">
              {agenda.professionals.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => { setProfessionalId(item.id); setStep('time'); }} className="flex w-full items-center gap-3 rounded-xl border border-tendi-line px-4 py-3.5 text-left hover:border-tendi-teal hover:bg-tendi-tealsoft/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: item.color }}>{item.name.charAt(0).toUpperCase()}</span>
                    <span className="text-sm font-semibold text-tendi-navy">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 'time' && (
          <section className="td-card p-5">
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-tendi-teal">Passo {stepNumber} de {STEP_ORDER.length}</p>
            <h2 className="td-title mt-1 text-base">Escolha o dia e o horário</h2>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-tendi-haze/70 px-2 py-2">
              <button type="button" onClick={() => setDay(current => shiftDay(current, -1))} className="td-btn td-btn-secondary td-btn-sm !bg-white"><ChevronLeft size={15} /></button>
              <p className="flex items-center gap-1.5 text-sm font-semibold capitalize text-tendi-navy"><Calendar size={15} />{formatDayLong(day)}</p>
              <button type="button" onClick={() => setDay(current => shiftDay(current, 1))} className="td-btn td-btn-secondary td-btn-sm !bg-white"><ChevronRight size={15} /></button>
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
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-tendi-teal">Passo {stepNumber} de {STEP_ORDER.length}</p>
            <h2 className="td-title mt-1 text-base">Seus dados</h2>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-tendi-haze/70 px-4 py-3 text-sm text-slate-600">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-tendi-teal shadow-card"><SegmentIcon size={16} /></span>
              <span>
                <span className="block"><strong className="text-tendi-navy">{service.name}</strong> com {professional.name}</span>
                <span className="mt-0.5 block capitalize">{formatDayLong(day)} às {formatTime(startMinutes)}</span>
              </span>
            </div>
            <form onSubmit={event => { event.preventDefault(); void submit(); }} className="mt-4 space-y-3">
              <div>
                <label htmlFor="public-name" className="mb-1.5 block text-xs font-semibold text-slate-600">Seu nome</label>
                <input id="public-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required className="td-input" placeholder="Nome completo" />
              </div>
              <div>
                <label htmlFor="public-phone" className="mb-1.5 block text-xs font-semibold text-slate-600">WhatsApp</label>
                <input id="public-phone" value={phone} onChange={event => setPhone(event.target.value)} inputMode="tel" required className="td-input" placeholder="(11) 99999-0000" />
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400"><MessageCircle size={12} />Enviamos a confirmação por aqui.</p>
              </div>
              {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
              <button type="submit" disabled={submitting} className="td-btn td-btn-teal w-full justify-center">{submitting && <Loader2 size={15} className="animate-spin" />}Confirmar {customerLabel === 'Paciente' ? 'consulta' : 'agendamento'}</button>
            </form>
          </section>
        )}

        {step === 'done' && service && professional && startMinutes !== null && (
          <section className="td-card p-6 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-tendi-tealsoft text-tendi-teal"><CheckCircle2 size={26} /></span>
            <h2 className="td-title mt-4 text-base">Agendamento confirmado!</h2>
            <p className="mt-2 text-sm text-slate-600">{service.name} com {professional.name}, <span className="capitalize">{formatDayLong(day)}</span> às {formatTime(startMinutes)}.</p>
            {agenda.organization.address && (
              <a href={mapsUrl(agenda.organization.address)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-tendi-teal underline decoration-tendi-teal/30 underline-offset-2 hover:text-tendi-navy">
                <MapPin size={12} />{agenda.organization.address}
              </a>
            )}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400"><MessageCircle size={13} />Você vai receber a confirmação pelo WhatsApp.</p>
            <p className="mt-1 text-[11px] text-slate-400">Precisa remarcar ou cancelar? É só responder a mensagem no WhatsApp.</p>
          </section>
        )}

        {step !== 'intro' && step !== 'done' && (
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><Check size={12} />Agendamento online do TendiDesk</p>
        )}
      </main>
    </div>
  );
}
