'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react';
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

export default function AgendaPage() {
  const supabase = useMemo(() => createClient() as any, []);
  const [userId, setUserId] = useState('');
  const [organization, setOrganization] = useState<AgendaOrganization | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [day, setDay] = useState('');
  const [tab, setTab] = useState<'day' | 'settings'>('day');
  const [filter, setFilter] = useState('');
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
      const { accessible: list } = await resolveCurrentOrganization<AgendaOrganization>(supabase, auth.user.id, 'id,name,timezone,business_segment,agenda_settings', requested);
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
      const { data: org } = await supabase.from('organizations').select('id,name,timezone,business_segment,agenda_settings').eq('id', organization.id).maybeSingle();
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
  const hasPrices = dayAppointments.some(item => item.price_cents !== null);
  const rescheduleRequests = dayAppointments.filter(item => item.reminder_reply === 'reschedule' && item.status === 'scheduled').length;
  const setupMissing = !activeProfessionals.length || !services.some(service => service.is_active);
  const firstOpen = shown.find(item => shiftsFor(hours, item.id, day ? weekdayOf(day) : 0).length) ?? shown[0];

  const actions = organization && tab === 'day' && activeProfessionals.length > 0
    ? <button type="button" onClick={() => setDraft({ day, professionalId: firstOpen?.id })} className="td-btn td-btn-teal min-h-11 w-full justify-center sm:w-auto"><Plus size={15} />Novo agendamento</button>
    : undefined;

  return (
    <WorkspaceShell title="Agenda" description="Horários marcados, confirmações e o movimento do dia" actions={actions}>
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
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Dia anterior" className="inline-flex size-10 items-center justify-center rounded-xl border border-tendi-line bg-white text-slate-500 transition hover:border-tendi-lilac/40 hover:text-tendi-indigo"><ChevronLeft size={16} /></button>
                <input type="date" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} aria-label="Dia" className="td-input min-w-0 flex-1 font-semibold text-tendi-navy sm:w-auto sm:flex-none" />
                <button type="button" onClick={() => setDay(shiftDay(day, 1))} aria-label="Próximo dia" className="inline-flex size-10 items-center justify-center rounded-xl border border-tendi-line bg-white text-slate-500 transition hover:border-tendi-lilac/40 hover:text-tendi-indigo"><ChevronRight size={16} /></button>
                {day !== today.day && <button type="button" onClick={() => setDay(today.day)} className="td-btn td-btn-secondary !text-tendi-teal">Hoje</button>}
                {activeProfessionals.length > 1 && (
                  <select value={filter} onChange={event => setFilter(event.target.value)} aria-label={`Filtrar por ${professionalLabel.toLowerCase()}`} className="td-input min-w-0 max-w-full font-semibold text-slate-600 sm:w-auto">
                    <option value="">Todos</option>
                    {activeProfessionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Atualizar" title="Atualizar" className="inline-flex size-10 items-center justify-center rounded-xl border border-tendi-line bg-white text-slate-500 transition hover:border-tendi-lilac/40 hover:text-tendi-indigo disabled:opacity-40"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button>
              </div>
            )}
          </div>

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {tab === 'settings' ? (
            <AgendaSettings organization={organization} professionals={professionals} services={services} hours={hours} canManage={canManage} canManageOrganization={canManageOrganization} professionalLabel={professionalLabel} onChanged={refresh} />
          ) : setupMissing ? (
            <div className="td-card min-w-0 border-dashed px-5 py-8 text-center sm:p-8">
              <CalendarDays className="mx-auto text-tendi-magenta" size={30} />
              <h2 className="mt-3 td-title text-base">Configure a agenda para começar</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Cadastre quem atende, os horários de atendimento e os serviços com a duração de cada um. Depois é só marcar os horários.</p>
              <button type="button" onClick={() => setTab('settings')} className="td-btn td-btn-teal mt-5">Configurar agora</button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold capitalize text-tendi-navy">{formatDayLong(day)}{day === today.day ? ' · hoje' : ''}</p>
                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
                  <Stat label="Marcados" value={summary.total} />
                  <Stat label="Confirmados" value={summary.confirmed} tone="text-emerald-700" />
                  <Stat label="Atendidos" value={summary.completed} />
                  <Stat label="Faltas" value={summary.noShow} tone={summary.noShow ? 'text-rose-700' : undefined} />
                  {rescheduleRequests > 0 && <Stat label="Pediram para remarcar" value={rescheduleRequests} tone="text-amber-700" />}
                  {hasPrices && <Stat label="Previsto no dia" value={formatPrice(summary.expectedCents)} detail={summary.receivedCents ? `${formatPrice(summary.receivedCents)} já atendido` : undefined} />}
                </div>
              </div>
              <DayGrid
                day={day}
                timeZone={timeZone}
                professionals={shown}
                hours={hours}
                appointments={dayAppointments}
                nowMinutes={day === today.day ? today.minutes : null}
                onCreate={(professionalId, minutes) => setDraft({ day, professionalId, minutes })}
                onOpen={appointment => setDraft({ day, appointment })}
              />
              <p className="text-xs text-slate-400">Clique num horário vazio para marcar. As áreas sombreadas ficam fora do horário de atendimento.</p>
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

function Stat({ label, value, tone, detail }: { label: string; value: number | string; tone?: string; detail?: string }) {
  return (
    <div className="td-card min-w-0 px-3 py-3.5 sm:px-4">
      <p className="td-eyebrow">{label}</p>
      <p className={`mt-1.5 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone ?? 'text-tendi-navy'}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400">{detail}</p>}
    </div>
  );
}

/** A agenda depende de tabelas novas: explica quando o banco ainda não foi atualizado. */
function agendaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /agenda_|appointments|timezone|business_segment|schema cache/i.test(message)
    ? 'A agenda ainda não foi ativada no banco de dados. Aplique a migration da agenda e recarregue a página.'
    : message;
}
