import { describe, expect, it } from 'vitest';
import {
  dayRange, daySummary, formatDuration, formatMinutes, freeSlots, isBlockingStatus, localParts, minutesOf,
  normalizePhone, overlaps, parsePrice, shiftDay, weekdayOf, withinHours, zonedToUtc,
} from './agenda';

describe('minutos do dia', () => {
  it('converte horários', () => {
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('09:30:00')).toBe(570);
    expect(minutesOf('24:00')).toBe(1440);
    expect(minutesOf('8:05')).toBe(485);
  });
  it.each(['', '25:00', '09:60', 'abc', '24:30', null, undefined])('recusa %s', value => {
    expect(minutesOf(value as never)).toBeNull();
  });
  it('formata minutos e duração', () => {
    expect(formatMinutes(570)).toBe('09:30');
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30');
  });
});

describe('fuso horário', () => {
  it('leva a hora local de São Paulo para UTC', () => {
    expect(zonedToUtc('2026-11-12', 9 * 60, 'America/Sao_Paulo').toISOString()).toBe('2026-11-12T12:00:00.000Z');
    expect(zonedToUtc('2026-11-12', 23 * 60 + 30, 'America/Sao_Paulo').toISOString()).toBe('2026-11-13T02:30:00.000Z');
  });
  it('respeita outros fusos, inclusive com horário de verão', () => {
    expect(zonedToUtc('2026-11-12', 9 * 60, 'America/Manaus').toISOString()).toBe('2026-11-12T13:00:00.000Z');
    expect(zonedToUtc('2026-01-15', 9 * 60, 'Europe/Lisbon').toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(zonedToUtc('2026-07-15', 9 * 60, 'Europe/Lisbon').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });
  it('usa São Paulo quando o fuso é inválido', () => {
    expect(zonedToUtc('2026-11-12', 540, 'Fuso/Inexistente').toISOString()).toBe('2026-11-12T12:00:00.000Z');
    expect(zonedToUtc('2026-11-12', 540, null).toISOString()).toBe('2026-11-12T12:00:00.000Z');
  });
  it('volta do UTC para dia, minutos e dia da semana locais', () => {
    expect(localParts('2026-11-12T12:00:00Z', 'America/Sao_Paulo')).toEqual({ day: '2026-11-12', minutes: 540, weekday: 4 });
    // 01:30 UTC de sexta ainda é quinta à noite em São Paulo.
    expect(localParts('2026-11-13T01:30:00Z', 'America/Sao_Paulo')).toEqual({ day: '2026-11-12', minutes: 22 * 60 + 30, weekday: 4 });
  });
  it('ida e volta dão o mesmo horário', () => {
    const instant = zonedToUtc('2026-03-08', 14 * 60 + 45, 'America/Sao_Paulo');
    expect(localParts(instant, 'America/Sao_Paulo')).toMatchObject({ day: '2026-03-08', minutes: 14 * 60 + 45 });
  });
  it('calcula o intervalo de um dia local', () => {
    const range = dayRange('2026-11-12', 'America/Sao_Paulo');
    expect(range.from.toISOString()).toBe('2026-11-12T03:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-11-13T03:00:00.000Z');
  });
  it('soma dias e descobre o dia da semana', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(weekdayOf('2026-11-12')).toBe(4);
    expect(weekdayOf('2026-11-15')).toBe(0);
  });
});

describe('horários livres', () => {
  const hours = [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 18 * 60 }];

  it('oferece horários de 15 em 15 minutos dentro dos turnos', () => {
    const slots = freeSlots({ hours: [{ start: 540, end: 600 }], busy: [], duration: 30 });
    expect(slots.map(formatMinutes)).toEqual(['09:00', '09:15', '09:30']);
  });
  it('não atravessa o intervalo de almoço', () => {
    const slots = freeSlots({ hours, busy: [], duration: 60 }).map(formatMinutes);
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('11:15');
    expect(slots).not.toContain('12:00');
    expect(slots).toContain('14:00');
    expect(slots[slots.length - 1]).toBe('17:00');
  });
  it('pula horários ocupados', () => {
    const slots = freeSlots({ hours: [{ start: 540, end: 660 }], busy: [{ start: 570, end: 600 }], duration: 30 }).map(formatMinutes);
    expect(slots).toEqual(['09:00', '10:00', '10:15', '10:30']);
  });
  it('não oferece horários que já passaram', () => {
    const slots = freeSlots({ hours: [{ start: 540, end: 660 }], busy: [], duration: 30, earliest: 10 * 60 + 5 }).map(formatMinutes);
    expect(slots).toEqual(['10:15', '10:30']);
  });
  it('retorna vazio quando o serviço não cabe ou não há turno', () => {
    expect(freeSlots({ hours: [{ start: 540, end: 560 }], busy: [], duration: 30 })).toEqual([]);
    expect(freeSlots({ hours: [], busy: [], duration: 30 })).toEqual([]);
    expect(freeSlots({ hours, busy: [], duration: 0 })).toEqual([]);
  });
  it('confere sobreposição e encaixe no turno', () => {
    expect(overlaps({ start: 540, end: 570 }, { start: 570, end: 600 })).toBe(false);
    expect(overlaps({ start: 540, end: 571 }, { start: 570, end: 600 })).toBe(true);
    expect(withinHours({ start: 690, end: 720 }, hours)).toBe(true);
    expect(withinHours({ start: 700, end: 730 }, hours)).toBe(false);
  });
});

describe('cliente e valores', () => {
  it('normaliza telefone brasileiro para o WhatsApp', () => {
    expect(normalizePhone('(85) 99999-0000')).toBe('+5585999990000');
    expect(normalizePhone('85 3333-0000')).toBe('+558533330000');
    expect(normalizePhone('+55 85 99999-0000')).toBe('+5585999990000');
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678');
  });
  it.each(['', '123', 'abc', null, '1234567890123456'])('recusa telefone %s', value => {
    expect(normalizePhone(value as never)).toBeNull();
  });
  it('lê preços digitados', () => {
    expect(parsePrice('49,90')).toBe(4990);
    expect(parsePrice('R$ 1.250,00')).toBe(125000);
    expect(parsePrice('50')).toBe(5000);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNaN();
  });
});

describe('status e resumo do dia', () => {
  it('cancelado e falta liberam o horário', () => {
    expect(isBlockingStatus('scheduled')).toBe(true);
    expect(isBlockingStatus('confirmed')).toBe(true);
    expect(isBlockingStatus('completed')).toBe(true);
    expect(isBlockingStatus('cancelled')).toBe(false);
    expect(isBlockingStatus('no_show')).toBe(false);
  });
  it('soma o dia', () => {
    const summary = daySummary([
      { status: 'scheduled', price_cents: 5000 },
      { status: 'confirmed', price_cents: 3000 },
      { status: 'completed', price_cents: 4000 },
      { status: 'no_show', price_cents: 5000 },
      { status: 'cancelled', price_cents: 5000 },
      { status: 'completed', price_cents: null },
    ]);
    expect(summary).toEqual({ total: 5, scheduled: 1, confirmed: 1, completed: 2, noShow: 1, cancelled: 1, expectedCents: 12000, receivedCents: 4000 });
  });
});
