import { describe, expect, it, vi } from 'vitest';
import { createPublicBooking, listPublicSlots, loadPublicAgenda } from './agenda-public-server';
import { normalizePublicBookingSettings } from './agenda-public';

type Row = Record<string, any>;

/** Banco em memória com o mínimo do construtor de consultas do Supabase usado pelo agendamento público. */
class FakeDb {
  t: Record<string, Row[]> = {
    organizations: [], agenda_professionals: [], agenda_services: [], agenda_hours: [], appointments: [],
    channel_connections: [], contacts: [], conversations: [], messages: [],
  };
  n = 0;
  from(table: string) { return new Query(this, table); }
}
class Query {
  mode: 'select' | 'insert' | 'update' = 'select';
  preds: Array<(row: Row) => boolean> = [];
  payload: any;
  max = Infinity;
  countHead = false;
  constructor(private db: FakeDb, private table: string) {}
  select(_columns?: string, opts?: { count?: string; head?: boolean }) { this.countHead = !!opts?.head; return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(column: string, value: any) { this.preds.push(row => row[column] === value); return this; }
  neq(column: string, value: any) { this.preds.push(row => row[column] !== value); return this; }
  gt(column: string, value: any) { this.preds.push(row => row[column] > value); return this; }
  gte(column: string, value: any) { this.preds.push(row => row[column] >= value); return this; }
  lt(column: string, value: any) { this.preds.push(row => row[column] < value); return this; }
  lte(column: string, value: any) { this.preds.push(row => row[column] <= value); return this; }
  order() { return this; }
  limit(count: number) { this.max = count; return this; }
  private run(): { data: any; error: any; count: number } {
    const rows = this.db.t[this.table] ?? (this.db.t[this.table] = []);
    if (this.mode === 'insert') {
      // Imita a constraint do banco: profissional não pode ter dois agendamentos ativos no mesmo instante.
      const blocking = ['scheduled', 'confirmed', 'completed'];
      const clash = rows.some(row => row.professional_id === this.payload.professional_id && blocking.includes(row.status)
        && this.payload.starts_at < row.ends_at && row.starts_at < this.payload.ends_at);
      if (clash) return { data: null, error: { code: '23P01', message: 'overlap' }, count: 0 };
      const row = { id: `${this.table}-${++this.db.n}`, created_at: new Date().toISOString(), ...this.payload };
      rows.push(row);
      return { data: [row], error: null, count: 0 };
    }
    let matched = rows.filter(row => this.preds.every(pred => pred(row)));
    if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: matched, error: null, count: 0 }; }
    return { data: matched.slice(0, this.max), error: null, count: matched.length };
  }
  maybeSingle() { const result = this.run(); return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: any, reject: any) {
    const result = this.run();
    return Promise.resolve(this.countHead ? { data: null, error: result.error, count: result.count } : result).then(resolve, reject);
  }
}

const ORG = 'org-1';
const SLUG = 'barbearia-central';
// Sexta-feira, 13/11/2026, 12:00 em São Paulo.
const NOW = new Date('2026-11-13T15:00:00Z');

function seed(overrides: { publicBooking?: Row; org?: Row } = {}) {
  const db = new FakeDb();
  db.t.organizations.push({
    id: ORG, slug: SLUG, name: 'Barbearia Central', status: 'active', trial_ends_at: null, timezone: 'America/Sao_Paulo',
    logo_url: null, address: 'Rua das Palmeiras, 123 - Centro', agenda_settings: { publicBooking: { enabled: true, windowDays: 14, minNoticeMinutes: 60, ...overrides.publicBooking } },
    ...overrides.org,
  });
  db.t.agenda_professionals.push({ id: 'prof-1', organization_id: ORG, name: 'Rafael', color: '#004751', is_active: true, position: 0 });
  db.t.agenda_services.push({ id: 'serv-1', organization_id: ORG, name: 'Corte', duration_minutes: 30, price_cents: 4000, is_active: true });
  // Sexta-feira (weekday 5): 09:00 às 18:00.
  db.t.agenda_hours.push({ id: 'h-1', organization_id: ORG, professional_id: 'prof-1', weekday: 5, starts: '09:00', ends: '18:00' });
  db.t.channel_connections.push({ organization_id: ORG, channel: 'whatsapp', provider_account_id: 'tendi-org-1', status: 'connected' });
  return db;
}

describe('normalizePublicBookingSettings', () => {
  it('cai no padrão (desligado) para valor vazio ou inválido', () => {
    expect(normalizePublicBookingSettings(null)).toEqual({ enabled: false, windowDays: 14, minNoticeMinutes: 60 });
    expect(normalizePublicBookingSettings({ publicBooking: { enabled: true, windowDays: 999, minNoticeMinutes: -5 } }))
      .toEqual({ enabled: true, windowDays: 14, minNoticeMinutes: 60 });
  });

  it('aceita valores dentro do limite', () => {
    expect(normalizePublicBookingSettings({ publicBooking: { enabled: true, windowDays: 30, minNoticeMinutes: 120 } }))
      .toEqual({ enabled: true, windowDays: 30, minNoticeMinutes: 120 });
  });
});

describe('loadPublicAgenda', () => {
  it('carrega profissionais e serviços ativos quando o recurso está ligado', async () => {
    const db = seed();
    db.t.agenda_services.push({ id: 'serv-2', organization_id: ORG, name: 'Barba (inativo)', duration_minutes: 20, price_cents: null, is_active: false });
    const agenda = await loadPublicAgenda(db as any, SLUG);
    expect(agenda?.organization.name).toBe('Barbearia Central');
    expect(agenda?.organization.address).toBe('Rua das Palmeiras, 123 - Centro');
    expect(agenda?.professionals).toEqual([{ id: 'prof-1', name: 'Rafael', color: '#004751' }]);
    expect(agenda?.services).toEqual([{ id: 'serv-1', name: 'Corte', durationMinutes: 30, priceCents: 4000 }]);
  });

  it('retorna null com o recurso desligado, empresa bloqueada ou slug inexistente', async () => {
    expect(await loadPublicAgenda(seed({ publicBooking: { enabled: false } }) as any, SLUG)).toBeNull();
    expect(await loadPublicAgenda(seed({ org: { status: 'suspended' } }) as any, SLUG)).toBeNull();
    expect(await loadPublicAgenda(seed() as any, 'outro-slug')).toBeNull();
  });

  it('retorna null sem profissional ou serviço ativo', async () => {
    const db = seed();
    db.t.agenda_professionals[0]!.is_active = false;
    expect(await loadPublicAgenda(db as any, SLUG)).toBeNull();
  });
});

describe('listPublicSlots', () => {
  it('oferece horários dentro do turno, respeitando a antecedência mínima e o que já está ocupado', async () => {
    const db = seed();
    const agenda = await loadPublicAgenda(db as any, SLUG);
    db.t.appointments.push({ id: 'a1', organization_id: ORG, professional_id: 'prof-1', status: 'scheduled', starts_at: '2026-11-13T13:00:00Z', ends_at: '2026-11-13T13:30:00Z' });
    const slots = await listPublicSlots(db as any, agenda!.organization, { professionalId: 'prof-1', durationMinutes: 30, day: '2026-11-13', now: NOW });
    // Agora local: 12:00. Antecedência mínima de 60 min -> primeiro horário possível é 13:00, mas 10:00 (13:00 UTC) já está ocupado.
    expect(slots).not.toContain(10 * 60); // 10:00 ocupado
    expect(slots[0]).toBe(13 * 60); // 13:00 livre, respeitando a antecedência mínima
    expect(Math.min(...slots)).toBeGreaterThanOrEqual(13 * 60);
  });

  it('não oferece nada fora da janela de dias permitida', async () => {
    const db = seed({ publicBooking: { windowDays: 7 } });
    const agenda = await loadPublicAgenda(db as any, SLUG);
    const slots = await listPublicSlots(db as any, agenda!.organization, { professionalId: 'prof-1', durationMinutes: 30, day: '2026-12-01', now: NOW });
    expect(slots).toEqual([]);
  });
});

describe('createPublicBooking', () => {
  const send = () => vi.fn().mockResolvedValue({ ok: true });

  it('cria o agendamento, o contato e envia a confirmação por WhatsApp', async () => {
    const db = seed();
    const agenda = await loadPublicAgenda(db as any, SLUG);
    const sendFn = send();
    const result = await createPublicBooking(db as any, agenda!, {
      professionalId: 'prof-1', serviceId: 'serv-1', day: '2026-11-13', startMinutes: 13 * 60,
      customerName: 'Maria Souza', customerPhone: '(85) 99999-0000',
    }, { send: sendFn, now: NOW });

    expect(result.ok).toBe(true);
    const appt = db.t.appointments[0]!;
    expect(appt).toMatchObject({ organization_id: ORG, professional_id: 'prof-1', service_id: 'serv-1', customer_name: 'Maria Souza', customer_phone: '+5585999990000', status: 'scheduled', source: 'customer', price_cents: 4000 });
    expect(db.t.contacts[0]).toMatchObject({ organization_id: ORG, full_name: 'Maria Souza', phone_e164: '+5585999990000', tags: ['agendar'] });
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0]![1].text).toContain('Rafael');
    expect(sendFn.mock.calls[0]![1].text).toContain('Rua das Palmeiras, 123 - Centro');
    expect(sendFn.mock.calls[0]![1].text).toContain('Precisa remarcar ou cancelar?');
  });

  it('não duplica a etiqueta "agendar" se o contato já tiver (ex.: já veio do WhatsApp)', async () => {
    const db = seed();
    db.t.contacts.push({ id: 'contact-existing', organization_id: ORG, phone_e164: '+5585999990000', full_name: 'Maria Souza', tags: ['vip', 'agendar'] });
    const agenda = await loadPublicAgenda(db as any, SLUG);
    await createPublicBooking(db as any, agenda!, {
      professionalId: 'prof-1', serviceId: 'serv-1', day: '2026-11-13', startMinutes: 13 * 60,
      customerName: 'Maria Souza', customerPhone: '85999990000',
    }, { send: send(), now: NOW });
    expect(db.t.contacts).toHaveLength(1);
    expect(db.t.contacts[0]!.tags).toEqual(['vip', 'agendar']);
  });

  it('rejeita horário que já não está mais livre', async () => {
    const db = seed();
    db.t.appointments.push({ id: 'a1', organization_id: ORG, professional_id: 'prof-1', status: 'scheduled', starts_at: '2026-11-13T16:00:00Z', ends_at: '2026-11-13T16:30:00Z' });
    const agenda = await loadPublicAgenda(db as any, SLUG);
    const result = await createPublicBooking(db as any, agenda!, {
      professionalId: 'prof-1', serviceId: 'serv-1', day: '2026-11-13', startMinutes: 13 * 60,
      customerName: 'Maria Souza', customerPhone: '85999990000',
    }, { send: send(), now: NOW });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it('rejeita telefone ou nome inválido', async () => {
    const db = seed();
    const agenda = await loadPublicAgenda(db as any, SLUG);
    const bad = { professionalId: 'prof-1', serviceId: 'serv-1', day: '2026-11-13', startMinutes: 13 * 60, customerName: 'Maria', customerPhone: '123' };
    expect(await createPublicBooking(db as any, agenda!, bad, { send: send(), now: NOW })).toMatchObject({ ok: false, status: 400 });
    expect(await createPublicBooking(db as any, agenda!, { ...bad, customerPhone: '85999990000', customerName: 'M' }, { send: send(), now: NOW })).toMatchObject({ ok: false, status: 400 });
  });

  it('trava depois de muitas tentativas do mesmo telefone', async () => {
    const db = seed();
    const agenda = await loadPublicAgenda(db as any, SLUG);
    const input = (minutes: number) => ({ professionalId: 'prof-1', serviceId: 'serv-1', day: '2026-11-13', startMinutes: minutes, customerName: 'Maria Souza', customerPhone: '85999990000' });
    await createPublicBooking(db as any, agenda!, input(13 * 60), { send: send(), now: NOW });
    await createPublicBooking(db as any, agenda!, input(14 * 60), { send: send(), now: NOW });
    await createPublicBooking(db as any, agenda!, input(15 * 60), { send: send(), now: NOW });
    const blocked = await createPublicBooking(db as any, agenda!, input(16 * 60), { send: send(), now: NOW });
    expect(blocked).toMatchObject({ ok: false, status: 429 });
  });
});
