'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase, CalendarCheck, CalendarDays, CalendarX2, ChevronLeft, ChevronRight, CircleCheck, Flower2, Loader2, Plus, RefreshCw,
  Scissors, Settings2, Stethoscope, Wallet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { WorkspaceShell } from '@/components/workspace-shell';
import { useWorkspaceRole } from '@/lib/use-workspace-role';
import { canAccess } from '@/lib/team';
import {
  DEFAULT_TIME_ZONE, SEGMENT_INFO, dayRange, daySummary, formatDayLong, formatPrice, isSegment, localParts, shiftDay,
} from '@/lib/agenda';
import { DayGrid } from '@/components/agenda/day-grid';
import { AppointmentDialog, type AppointmentDraft } from '@/components/agenda/appointment-dialog';
import { AgendaSettings } from '@/components/agenda/agenda-settings';
import {
  APPOINTMENT_COLUMNS, shiftsFor, type AgendaOrganization, type Appointment, type HoursRow, type Professional, type Service,
} from '@/components/agenda/types';
import { weekdayOf } from '@/lib/agenda';
import { requestedOrganizationId, resolveCurrentOrganization } from '@/lib/current-organization';

/** Ícone por segmento: mesma identidade visual da Configuração, agora também no dia a dia da agenda. */
const SEGMENT_ICON: Record<string, typeof Scissors> = { barbershop: Scissors, clinic: Stethoscope, beauty: Flower2, other: Briefcase };

export default function AgendaPage() {
  const supabase = useMemo(() => createClient() as any, []);
  const [userId, setUserId] = useState('');
  const [organization, setOrganization] = useState<AgendaOrganization | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [day, setDay] = useState('');
  const [tab, setTab] = useState<'day' | 'settings'>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'settings' ? 'settings' : 'day');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'confirmed' | 'completed' | 'no_show' | 'reschedule'>('');
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const { role } = useWorkspaceRole(organization?.id);
  const canManage = canAccess(role, 'configuracoes');
  const canManageOrganization = canAccess(role, 'assinatura');

  const timeZone = organization?.timezone || DEFAULT_TIME_ZONE;
  const segment = isSegment(organization?.business_segment) ? organization!.business_segment as keyof typeof SEGMENT_INFO : 'other';
  const customerLabel = SEGMENT_INFO[segment].customer;
  const professionalLabel = SEGMENT_INFO[segment].professional;
  const SegmentIcon = SEGMENT_ICON[segment] ?? Briefcase;

  const loadSetup = useCallback(async (organizationId: string) => {
    const [professionalRows, serviceRows, hourRows] = await Promise.all([
      supabase.from('agenda_professionals').select('id,name,color,is_active,position').eq('organization_id', organizationId).order('position').order('created_at'),
      supabase.from('agenda_services').select('id,name,duration_minutes,price_cents,is_active').eq('organization_id', organizationId).order('name'),
      supabase.from('agenda_hours').select('id,professional_id,weekday,starts,ends').eq('organization_id', organizationId),
    ]);
    const failure = professionalRows.error ?? serviceRows.error ?? hourRows.error;
    if (failure) throw new Error(failure.message);
    setProfessionals((professionalRows.data ?? []) as Professional[]);
    setServices((serviceRows.data ?? []) as Service[]);
    setHours((hourRows.data ?? []) as HoursRow[]);
  }, [supabase]);

  const loadDay = useCallback(async (organizationId: string, target: string, zone: string) => {
    const range = dayRange(target, zone);
    const { data, error: queryError } = await supabase.from('appointments').select(APPOINTMENT_COLUMNS)
      .eq('organization_id', organizationId)
      .lt('starts_at', range.to.toISOString()).gte('starts_at', range.from.toISOString())
      .order('starts_at');
    if (queryError) throw new Error(queryError.message);
    setAppointments((data ?? []) as Appointment[]);
  }, [supabase]);

  // Empresa da pessoa (vínculo ativo), como no Inbox.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { window.location.assign('/login'); return; }
      // Empresas em que a pessoa trabalha: vínculo ativo ou acesso de suporte liberado pelo cliente.
      const requested = requestedOrganizationId();
      const { accessible: list } = await resolveCurrentOrganization<AgendaOrganization>(supabase, auth.user.id, 'id,name,slug,timezone,business_segment,agenda_settings,address', requested);
      if (!active) return;
      const selected = list.find(org => org.id === requested) ?? list[0] ?? null;
      if (!selected) { setLoading(false); return; }
      setUserId(auth.user.id);
      setOrganization(selected);
      setDay(localParts(new Date(), selected.timezone || DEFAULT_TIME_ZONE).day);
      await loadSetup(selected.id);
      setLoading(false);
    })().catch(err => { if (active) { setError(agendaError(err)); setLoading(false); } });
    return () => { active = false; };
  }, [supabase, loadSetup]);

  useEffect(() => {
    if (!organization || !day) return;
    let active = true;
    loadDay(organization.id, day, timeZone).catch(err => { if (active) setError(agendaError(err)); });
    return () => { active = false; };
  }, [organization, day, timeZone, loadDay]);

  // Deep links from scheduled reminder push notifications must open the settings list.
  useEffect(() => {
    const openFromUrl = () => {
      if (new URLSearchParams(window.location.search).get('tab') === 'settings') setTab('settings');
    };
    openFromUrl();
    window.addEventListener('popstate', openFromUrl);
    return () => window.removeEventListener('popstate', openFromUrl);
  }, []);

  // Linha do "agora" na grade.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function refresh() {
    if (!organization) return;
    setRefreshing(true);
    setError('');
    try {
      const { data: org } = await supabase.from('organizations').select('id,name,slug,timezone,business_segment,agenda_settings,address').eq('id', organization.id).maybeSingle();
      if (org) setOrganization(org as AgendaOrganization);
      await Promise.all([loadSetup(organization.id), loadDay(organization.id, day, timeZone)]);
    } catch (err) { setError(agendaError(err)); } finally { setRefreshing(false); }
  }

  const today = localParts(now, timeZone);
  const activeProfessionals = professionals.filter(item => item.is_active);
  const shown = filter ? activeProfessionals.filter(item => item.id === filter) : activeProfessionals;
  const shownIds = new Set(shown.map(item => item.id));
  const dayAppointments = appointments.filter(item => shownIds.has(item.professional_id));
  const summary = daySummary(dayAppointments);
  const visibleAppointments = dayAppointments.filter(item => {
    if (!statusFilter) return true;
    if (statusFilter === 'reschedule') return item.reminder_reply === 'reschedule' && item.status === 'scheduled';
    return item.status === statusFilter;
  });

  async function quickStatus(appointment: Appointment, status: 'completed' | 'no_show') {
    if (!organization) return;
    const { error: updateError } = await supabase.from('appointments').update({ status }).eq('id', appointment.id).eq('organization_id', organization.id);
    if (updateError) { setError(updateError.message); return; }
    await loadDay(organization.id, day, timeZone).catch(err => setError(agendaError(err)));
  }
  const hasPrices = dayAppointments.some(item => item.price_cents !== null);
  const rescheduleRequests = dayAppointments.filter(item => item.reminder_reply === 'reschedule' && item.status === 'scheduled').length;
  const setupMissing = !activeProfessionals.length || !services.some(service => service.is_active);
  const firstOpen = shown.find(item => shiftsFor(hours, item.id, day ? weekdayOf(day) : 0).length) ?? shown[0];

  const actions = organization && tab === 'day' && activeProfessionals.length > 0
    ? <button type="button" onClick={() => setDraft({ day, professionalId: firstOpen?.id })} className="td-btn td-btn-teal min-h-11 w-full justify-center sm:w-auto"><Plus size={15} />Novo agendamento</button>
    : undefined;

  return (
    <WorkspaceShell title="Agendar" description="Horários marcados, confirmações e o movimento do dia" actions={actions}>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando agenda…</p>
      ) : !organization ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-card">{error || 'Sua conta não tem vínculo ativo com uma empresa.'}</p>
      ) : (
        <div className="min-w-0 space-y-5">
          <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="td-tabs flex w-full sm:w-auto">
              <button type="button" onClick={() => setTab('day')} aria-pressed={tab === 'day'} className={`td-tab min-h-11 flex-1 justify-center sm:flex-none ${tab === 'day' ? 'td-tab-active' : ''}`}><CalendarDays size={14} />Dia</button>
              <button type="button" onClick={() => setTab('settings')} aria-pressed={tab === 'settings'} className={`td-tab min-h-11 flex-1 justify-center sm:flex-none ${tab === 'settings' ? 'td-tab-active' : ''}`}><Settings2 size={14} />Configurar</button>
            </div>
            {tab === 'day' && (
              <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-tendi-line bg-white p-1.5 shadow-card sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex min-w-0 items-center gap-1.5">
                  <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Dia anterior" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-tendi-haze hover:text-tendi-indigo"><ChevronLeft size={16} /></button>
                  <input type="date" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} aria-label="Dia" className="td-input min-w-0 flex-1 !border-0 !shadow-none font-semibold text-tendi-navy sm:w-auto sm:flex-none" />
                  <button type="button" onClick={() => setDay(shiftDay(day, 1))} aria-label="Próximo dia" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-tendi-haze hover:text-tendi-indigo"><ChevronRight size={16} /></button>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  {day !== today.day && <>
                    <span className="hidden h-6 w-px shrink-0 bg-tendi-line sm:block" />
                    <button type="button" onClick={() => setDay(today.day)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-tendi-teal transition hover:bg-tendi-tealsoft">Hoje</button>
                  </>}
                  <span className="hidden h-6 w-px shrink-0 bg-tendi-line sm:block" />
                  <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Atualizar" title="Atualizar" className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-tendi-haze hover:text-tendi-indigo disabled:opacity-40 sm:ml-0"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button>
                </div>
              </div>
            )}
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {tab === 'settings' ? (
            <AgendaSettings organization={organization} professionals={professionals} services={services} hours={hours} canManage={canManage} canManageOrganization={canManageOrganization} professionalLabel={professionalLabel} customerLabel={customerLabel} onChanged={refresh} />
          ) : setupMissing ? (
            <div className="td-card min-w-0 border-dashed px-5 py-8 text-center sm:p-8">
              <CalendarDays className="mx-auto text-tendi-magenta" size={30} />
              <h2 className="mt-3 td-title text-base">Configure o Agendar para começar</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Cadastre quem atende, os horários de atendimento e os serviços com a duração de cada um. Depois é só marcar os horários.</p>
              <button type="button" onClick={() => setTab('settings')} className="td-btn td-btn-teal mt-5">Configurar agora</button>
            </div>
          ) : (
            <>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold capitalize text-tendi-navy">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-tendi-tealsoft text-tendi-teal"><SegmentIcon size={14} /></span>
                  {formatDayLong(day)}{day === today.day ? ' · hoje' : ''}
                </p>
                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
                  <Stat label="Marcados" value={summary.total} icon={CalendarDays} iconClass="bg-tendi-mist text-tendi-indigo" active={statusFilter === ''} onClick={() => setStatusFilter('')} />
                  <Stat label="Confirmados" value={summary.confirmed} tone="text-emerald-700" icon={CircleCheck} iconClass="bg-emerald-50 text-emerald-600" active={statusFilter === 'confirmed'} onClick={() => setStatusFilter(current => current === 'confirmed' ? '' : 'confirmed')} />
                  <Stat label="Atendidos" value={summary.completed} icon={CalendarCheck} iconClass="bg-tendi-tealsoft text-tendi-teal" active={statusFilter === 'completed'} onClick={() => setStatusFilter(current => current === 'completed' ? '' : 'completed')} />
                  <Stat label="Faltas" value={summary.noShow} tone={summary.noShow ? 'text-rose-700' : undefined} icon={CalendarX2} iconClass="bg-rose-50 text-rose-600" active={statusFilter === 'no_show'} onClick={() => setStatusFilter(current => current === 'no_show' ? '' : 'no_show')} />
                  {rescheduleRequests > 0 && <Stat label="Pediram para remarcar" value={rescheduleRequests} tone="text-amber-700" icon={CalendarX2} iconClass="bg-amber-50 text-amber-700" active={statusFilter === 'reschedule'} onClick={() => setStatusFilter(current => current === 'reschedule' ? '' : 'reschedule')} />}
                  {hasPrices && <Stat label="Previsto no dia" value={formatPrice(summary.expectedCents)} detail={summary.receivedCents ? `${formatPrice(summary.receivedCents)} já atendido` : undefined} icon={Wallet} iconClass="bg-tendi-blush text-tendi-magenta" />}
                </div>
              </div>
              {activeProfessionals.length > 1 && (
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  <button type="button" onClick={() => setFilter('')} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${!filter ? 'bg-tendi-navy text-white' : 'border border-tendi-line bg-white text-slate-600 hover:border-tendi-lilac/40'}`}>Todos</button>
                  {activeProfessionals.map(item => (
                    <button key={item.id} type="button" onClick={() => setFilter(current => current === item.id ? '' : item.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${filter === item.id ? 'text-white' : 'border border-tendi-line bg-white text-slate-600 hover:border-tendi-lilac/40'}`} style={filter === item.id ? { backgroundColor: item.color } : undefined}>{item.name}</button>
                  ))}
                </div>
              )}
              <DayGrid
                day={day}
                timeZone={timeZone}
                professionals={shown}
                hours={hours}
                appointments={visibleAppointments}
                onCreate={(professionalId, minutes) => setDraft({ day, professionalId, minutes })}
                onOpen={appointment => setDraft({ day, appointment })}
                onQuickStatus={(appointment, status) => void quickStatus(appointment, status)}
              />
              <p className="text-xs text-slate-400">Clique em &quot;Livre até&quot; para marcar nesse horário, ou no card de um cliente pra ver mais opções.</p>
            </>
          )}
        </div>
      )}

      {draft && organization && (
        <AppointmentDialog
          draft={draft}
          organizationId={organization.id}
          timeZone={timeZone}
          professionals={professionals}
          services={services}
          hours={hours}
          customerLabel={customerLabel}
          professionalLabel={professionalLabel}
          userId={userId}
          onClose={() => setDraft(null)}
          onSaved={savedDay => { setDraft(null); if (savedDay !== day) setDay(savedDay); else void loadDay(organization.id, day, timeZone).catch(err => setError(agendaError(err))); }}
        />
      )}
    </WorkspaceShell>
  );
}

function Stat({ label, value, tone, detail, icon: Icon, iconClass, active, onClick }: {
  label: string; value: number | string; tone?: string; detail?: string; icon: typeof CalendarCheck; iconClass: string;
  /** Quando clicável, filtra a lista de agendamentos abaixo por esse status (dá destaque quando ativo). */
  active?: boolean; onClick?: () => void;
}) {
  const className = `min-w-0 rounded-card px-3 py-3.5 text-left transition sm:px-4 ${active ? 'bg-tendi-navy shadow-pop' : 'td-card hover:-translate-y-0.5'}`;
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/10 text-white' : iconClass}`}><Icon size={13} /></span>
        <p className={`td-eyebrow truncate ${active ? '!text-white/60' : ''}`}>{label}</p>
      </div>
      <p className={`mt-2 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${active ? 'text-white' : (tone ?? 'text-tendi-navy')}`}>{value}</p>
      {detail && <p className={`text-[11px] ${active ? 'text-white/50' : 'text-slate-400'}`}>{detail}</p>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
}

/** A agenda depende de tabelas novas: explica quando o banco ainda não foi atualizado. */
function agendaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /agenda_|appointments|timezone|business_segment|schema cache/i.test(message)
    ? 'A agenda ainda não foi ativada no banco de dados. Aplique a migration da agenda e recarregue a página.'
    : message;
}
