import { describe, expect, it } from 'vitest';
import type { NamedCalendar } from '@/lib/calendars/load';
import { eventEnd, readCalendarDate } from './load';

const cal: NamedCalendar = {
  id: 'cal-1',
  name: 'Prova',
  calendar: {
    months: [
      { name: 'Alba', days: 30 },
      { name: 'Sole', days: 30 },
    ],
    weekdays: [],
    eras: [],
    epochWeekday: 0,
  },
};
const value = (year: number, month: number, day: number, calendar = 'cal-1') => ({
  calendar,
  year,
  month,
  day,
});

describe('readCalendarDate', () => {
  it('legge solo date del calendario scelto che esistono', () => {
    expect(readCalendarDate(cal, value(5, 2, 30))).toEqual({ year: 5, month: 2, day: 30 });
    expect(readCalendarDate(cal, value(5, 2, 31))).toBeNull();
    expect(readCalendarDate(cal, value(5, 1, 1, 'altro'))).toBeNull();
    expect(readCalendarDate(cal, 'boh')).toBeNull();
    expect(readCalendarDate(cal, { calendar: 'cal-1', year: '5', month: 1, day: 1 })).toBeNull();
  });
});

describe('eventEnd', () => {
  const start = { year: 10, month: 1, day: 1 };
  it('la fine valida dopo l’inizio resta, anche lo stesso giorno', () => {
    expect(eventEnd(cal, start, value(12, 1, 1))).toEqual({ year: 12, month: 1, day: 1 });
    expect(eventEnd(cal, start, value(10, 1, 1))).toEqual(start);
  });

  it('una fine prima dell’inizio, mancante o non valida rende l’evento puntuale', () => {
    expect(eventEnd(cal, start, value(9, 2, 30))).toBeNull();
    expect(eventEnd(cal, start, undefined)).toBeNull();
    expect(eventEnd(cal, start, value(12, 3, 1))).toBeNull();
  });
});
