import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_TIME_ZONE, SLOT_STEP_MINUTES, dayRange, formatMinutes, freeSlots, isBlockingStatus, localParts,
  normalizePhone, weekdayOf, zonedToUtc, type Interval,
} from './agenda';
import { ensureContact, ensureConversation } from './dapi-webhook';
import { connectedSession, sendSystemMessage, type SendFn } from './agenda-reminders-server';
import { ACCESS_COLUMNS, isOrganizationBlocked, type TrialOrganization } from './trial';
import { normalizePublicBookingSettings, type PublicBookingSettings } from './agenda-public';

/**
 * Agendamento público: o cliente final marca um horário sozinho, por um link, sem entrar no
 * painel. O visitante nunca fala direto com o Supabase — só com as rotas /api/agenda-public/*,
 * que usam a chave de serviço e reaproveitam as mesmas regras de fuso e vagas livres da Agenda
 * interna (./agenda.ts). Este arquivo concentra essas operações, igual a webchat-server.ts.
 */

type Db = SupabaseClient<any, any, any>;

export type { PublicBookingSettings };

type OrgRow = TrialOrganization & {
  id: string; name: string; timezone: string | null; business_segment: string | null; agenda_settings: unknown; logo_url: string | null; address: string | null;
};

export type PublicAgendaOrganization = {
  id: string; name: string; timezone: string; segment: string; logoUrl: string | null; address: string | null; settings: PublicBookingSettings;
};
export type PublicProfessional = { id: string; name: string; color: string };
export type PublicService = { id: string; name: string; durationMinutes: number; priceCents: number | null };

export type PublicAgenda = { organization: PublicAgendaOrganization; professionals: PublicProfessional[]; services: PublicService[] };

/** Agenda pública da empresa pelo slug, ou null se não existe, está sem acesso, ou não ligou o recurso. */
export async function loadPublicAgenda(admin: Db, slug: string): Promise<PublicAgenda | null> {
  if (!slug || slug.length > 80) return null;
  const { data } = await admin.from('organizations')
    .select(`id,name,timezone,business_segment,agenda_settings,logo_url,address,${ACCESS_COLUMNS}`)
    .eq('slug', slug).maybeSingle();
  const org = data as OrgRow | null;
  if (!org || isOrganizationBlocked(org)) return null;
  const settings = normalizePublicBookingSettings(org.agenda_settings);
  if (!settings.enabled) return null;

  const [professionalRows, serviceRows] = await Promise.all([
    admin.from('agenda_professionals').select('id,name,color').eq('organization_id', org.id).eq('is_active', true).order('position').order('created_at'),
    admin.from('agenda_services').select('id,name,duration_minutes,price_cents').eq('organization_id', org.id).eq('is_active', true).order('name'),
  ]);
  const professionals = ((professionalRows.data ?? []) as Array<{ id: string; name: string; color: string }>)
    .map(row => ({ id: row.id, name: row.name, color: row.color }));
  const services = ((serviceRows.data ?? []) as Array<{ id: string; name: string; duration_minutes: number; price_cents: number | null }>)
    .map(row => ({ id: row.id, name: row.name, durationMinutes: row.duration_minutes, priceCents: row.price_cents }));
  if (!professionals.length || !services.length) return null;

  return {
    organization: {
      id: org.id, name: org.name, timezone: org.timezone || DEFAULT_TIME_ZONE,
      segment: org.business_segment || 'other', logoUrl: org.logo_url, address: org.address, settings,
    },
    professionals, services,
  };
}

/** "2026-11-30" cabe na janela de dias que a empresa permite marcar (hoje até hoje + windowDays)? */
function withinBookingWindow(day: string, timeZone: string, windowDays: number, now: Date): boolean {
  const today = localParts(now, timeZone).day;
  const from = zonedToUtc(today, 0, timeZone);
  const to = zonedToUtc(day, 0, timeZone);
  const diffDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= windowDays;
}

/** Vagas livres (minutos do dia, hora local) de um profissional para um serviço, num dia. */
export async function listPublicSlots(admin: Db, organization: PublicAgendaOrganization, input: {
  professionalId: string; durationMinutes: number; day: string; now?: Date;
}): Promise<number[]> {
  const now = input.now ?? new Date();
  if (!withinBookingWindow(input.day, organization.timezone, organization.settings.windowDays, now)) return [];

  const weekday = weekdayOf(input.day);
  const [hourRows, appointmentRows] = await Promise.all([
    admin.from('agenda_hours').select('starts,ends').eq('professional_id', input.professionalId).eq('weekday', weekday),
    admin.from('appointments').select('starts_at,ends_at,status')
      .eq('organization_id', organization.id).eq('professional_id', input.professionalId)
      .gte('starts_at', dayRange(input.day, organization.timezone).from.toISOString())
      .lt('starts_at', dayRange(input.day, organization.timezone).to.toISOString()),
  ]);
  const hours: Interval[] = ((hourRows.data ?? []) as Array<{ starts: string; ends: string }>)
    .map(row => ({ start: Number(row.starts.slice(0, 2)) * 60 + Number(row.starts.slice(3, 5)), end: Number(row.ends.slice(0, 2)) * 60 + Number(row.ends.slice(3, 5)) }));
  const busy: Interval[] = ((appointmentRows.data ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>)
    .filter(row => isBlockingStatus(row.status))
    .map(row => ({ start: localParts(row.starts_at, organization.timezone).minutes, end: localParts(row.ends_at, organization.timezone).minutes }));

  const todayLocal = localParts(now, organization.timezone);
  const earliest = input.day === todayLocal.day ? todayLocal.minutes + organization.settings.minNoticeMinutes : undefined;
  return freeSlots({ hours, busy, duration: input.durationMinutes, step: SLOT_STEP_MINUTES, earliest });
}

export type PublicBookingInput = {
  professionalId: string; serviceId: string; day: string; startMinutes: number; customerName: string; customerPhone: string;
};
export type PublicBookingResult = { ok: true; appointmentId: string } | { ok: false; status: number; error: string };

const MAX_RECENT_BOOKINGS = 3;
const RECENT_WINDOW_MS = 30 * 60 * 1000;

/** Marcações recentes (origem "customer") deste telefone nesta empresa: trava quem manda em excesso. */
async function recentBookingCount(admin: Db, organizationId: string, phone: string): Promise<number> {
  const { count } = await admin.from('appointments').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).eq('customer_phone', phone).eq('source', 'customer')
    .gte('created_at', new Date(Date.now() - RECENT_WINDOW_MS).toISOString());
  return count ?? 0;
}

/** Cria o agendamento marcado pelo próprio cliente: valida tudo de novo no servidor (nunca confia no navegador). */
export async function createPublicBooking(admin: Db, agenda: PublicAgenda, input: PublicBookingInput, deps: { send: SendFn; now?: Date }): Promise<PublicBookingResult> {
  const now = deps.now ?? new Date();
  const { organization, professionals, services } = agenda;
  const professional = professionals.find(item => item.id === input.professionalId);
  const service = services.find(item => item.id === input.serviceId);
  if (!professional || !service) return { ok: false, status: 404, error: 'Profissional ou serviço não encontrado.' };

  const phone = normalizePhone(input.customerPhone);
  const name = input.customerName.trim().slice(0, 120);
  if (!phone) return { ok: false, status: 400, error: 'Informe um WhatsApp válido.' };
  if (name.length < 2) return { ok: false, status: 400, error: 'Informe o seu nome.' };

  if ((await recentBookingCount(admin, organization.id, phone)) >= MAX_RECENT_BOOKINGS) {
    return { ok: false, status: 429, error: 'Muitas tentativas de agendamento. Aguarde um instante e tente de novo.' };
  }

  const slots = await listPublicSlots(admin, organization, { professionalId: professional.id, durationMinutes: service.durationMinutes, day: input.day, now });
  if (!slots.includes(input.startMinutes)) return { ok: false, status: 409, error: 'Esse horário não está mais disponível. Escolha outro.' };

  const startsAt = zonedToUtc(input.day, input.startMinutes, organization.timezone);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const contact = await ensureContact(admin, organization.id, phone, name);
  const conversation = await ensureConversation(admin, organization.id, contact.id, now.toISOString());

  const inserted = await admin.from('appointments').insert({
    organization_id: organization.id, professional_id: professional.id, service_id: service.id,
    contact_id: contact.id, conversation_id: conversation.id,
    customer_name: name, customer_phone: phone, service_name: service.name,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    status: 'scheduled', source: 'customer', price_cents: service.priceCents,
  }).select('id').single();
  if (inserted.error) {
    // Choque de horário: outro cliente marcou o mesmo instante entre a checagem e o insert.
    if (inserted.error.code === '23P01') return { ok: false, status: 409, error: 'Esse horário acabou de ser ocupado. Escolha outro.' };
    return { ok: false, status: 500, error: 'Não foi possível concluir o agendamento.' };
  }
  const appointmentId = (inserted.data as { id: string }).id;

  const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: organization.timezone }).format(startsAt);
  const timeLabel = formatMinutes(input.startMinutes);
  const sessionId = await connectedSession(admin, organization.id);
  if (sessionId) {
    const addressLine = organization.address ? `\n📍 ${organization.address}` : '';
    const text = `Olá, ${name}! Seu horário com ${professional.name} (${organization.name}) está marcado para ${dayLabel} às ${timeLabel}.${addressLine}\n\nPrecisa remarcar ou cancelar? É só responder esta mensagem.`;
    await sendSystemMessage(admin, {
      organizationId: organization.id, sessionId, conversationId: conversation.id, phone, text,
      kind: 'public_booking_confirmation', appointmentId,
    }, deps.send).catch(() => undefined);
  }

  return { ok: true, appointmentId };
}
