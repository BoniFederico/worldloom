import { describe, expect, it } from 'vitest';
import type { Calendar } from './calendar';
import {
  calendarDateFromInput,
  calendarDateToInput,
  calendarToForm,
  parseCalendarForm,
} from './input';

const form = (values: Record<string, string>) => (name: string) => values[name];

const fantasy: Calendar = {
  months: [
    { name: 'Alba', days: 20 },
    { name: 'Zenit', days: 20 },
  ],
  weekdays: ['Uno', 'Due'],
  eras: [{ name: 'Seconda Era', start: 100 }],
  leap: { every: 4, month: 2, days: 1 },
  epochWeekday: 0,
};

describe('parseCalendarForm', () => {
  const base = {
    name: 'Calendario di Aurelia',
    months: 'Alba, 20\nZenit, 20\n\n',
    weekdays: 'Uno, Due,  Tre',
    eras: 'Prima Era, -500\nSeconda Era, 100',
    leapEvery: '4',
    leapMonth: '2',
    leapDays: '1',
    epochWeekday: '2',
  };

  it('legge nome, mesi, giorni della settimana, ere e anno lungo', () => {
    const r = parseCalendarForm(form(base));
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Calendario di Aurelia',
        calendar: {
          months: [
            { name: 'Alba', days: 20 },
            { name: 'Zenit', days: 20 },
          ],
          weekdays: ['Uno', 'Due', 'Tre'],
          eras: [
            { name: 'Prima Era', start: -500 },
            { name: 'Seconda Era', start: 100 },
          ],
          leap: { every: 4, month: 2, days: 1 },
          epochWeekday: 1,
        },
      },
    });
  });

  it('i campi facoltativi possono mancare', () => {
    const r = parseCalendarForm(
      form({ name: 'Minimo', months: 'Unico, 10', weekdays: '', eras: '', leapEvery: '' }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Minimo',
        calendar: {
          months: [{ name: 'Unico', days: 10 }],
          weekdays: [],
          eras: [],
          epochWeekday: 0,
        },
      },
    });
  });

  it('segnala l’errore giusto', () => {
    const err = (patch: Record<string, string>) => {
      const r = parseCalendarForm(form({ ...base, ...patch }));
      return r.ok ? 'ok' : r.error;
    };
    expect(err({ name: '  ' })).toBe('invalid_name');
    expect(err({ months: '' })).toBe('invalid_months');
    expect(err({ months: 'Alba' })).toBe('invalid_months');
    expect(err({ months: 'Alba, venti' })).toBe('invalid_months');
    expect(err({ months: 'Alba, 0' })).toBe('invalid_months');
    expect(err({ eras: 'Era senza anno' })).toBe('invalid_eras');
    expect(err({ eras: 'X, 1\nX, 2' })).toBe('invalid_eras');
    expect(err({ leapMonth: '9' })).toBe('invalid_leap');
    expect(err({ leapEvery: '1' })).toBe('invalid_leap');
    expect(err({ leapEvery: '' })).toBe('invalid_leap'); // mese e giorni senza «ogni quanti anni»
    expect(err({ epochWeekday: '9' })).toBe('invalid_epoch');
    expect(err({ months: 'A, 1\n'.repeat(41) })).toBe('invalid_months');
  });
});

describe('calendarToForm', () => {
  it('riporta nei campi di testo la stessa definizione', () => {
    const f = calendarToForm(fantasy);
    expect(f).toEqual({
      months: 'Alba, 20\nZenit, 20',
      weekdays: 'Uno, Due',
      eras: 'Seconda Era, 100',
      leapEvery: '4',
      leapMonth: '2',
      leapDays: '1',
      epochWeekday: '1',
    });
    const again = parseCalendarForm(form({ name: 'X', ...f }));
    expect(again.ok && again.value.calendar).toEqual(fantasy);
  });
});

describe('date nei campi', () => {
  it('compone il valore salvato dai campi del form', () => {
    expect(
      calendarDateFromInput(fantasy, 'cal-1', {
        era: 'Seconda Era',
        year: '12',
        month: '2',
        day: '7',
      }),
    ).toEqual({
      ok: true,
      value: { calendar: 'cal-1', year: 111, month: 2, day: 7, era: 'Seconda Era' },
    });
    expect(
      calendarDateFromInput(fantasy, 'cal-1', { era: '', year: '-4', month: '1', day: '1' }),
    ).toEqual({ ok: true, value: { calendar: 'cal-1', year: -4, month: 1, day: 1 } });
  });

  it('tutti i campi vuoti significano «nessuna data»', () => {
    expect(
      calendarDateFromInput(fantasy, 'cal-1', { era: '', year: '', month: '', day: '' }),
    ).toEqual({ ok: true, value: '' });
  });

  it('rifiuta date incomplete o inesistenti', () => {
    const bad = (i: { era?: string; year: string; month: string; day: string }) =>
      calendarDateFromInput(fantasy, 'cal-1', { era: '', ...i }).ok;
    expect(bad({ year: '5', month: '', day: '3' })).toBe(false);
    expect(bad({ year: '5', month: '3', day: '1' })).toBe(false);
    expect(bad({ year: '5', month: '1', day: '21' })).toBe(false);
    expect(bad({ year: '5', month: '2', day: '21' })).toBe(false); // l'anno 5 non è lungo
    expect(bad({ year: '4', month: '2', day: '21' })).toBe(true);
    expect(bad({ year: 'x', month: '1', day: '1' })).toBe(false);
    expect(bad({ era: 'Terza Era', year: '1', month: '1', day: '1' })).toBe(false);
    expect(bad({ era: 'Seconda Era', year: '0', month: '1', day: '1' })).toBe(false);
    expect(bad({ era: 'Seconda Era', year: '-3', month: '1', day: '1' })).toBe(false);
  });

  it('rilegge il valore come campi del form, con l’era se esiste', () => {
    expect(
      calendarDateToInput(fantasy, { calendar: 'cal-1', year: 111, month: 2, day: 7 }),
    ).toEqual({ calendar: 'cal-1', era: 'Seconda Era', year: '12', month: '2', day: '7' });
    expect(calendarDateToInput(fantasy, { calendar: 'cal-1', year: 50, month: 1, day: 1 })).toEqual(
      { calendar: 'cal-1', era: '', year: '50', month: '1', day: '1' },
    );
    expect(calendarDateToInput(fantasy, 'boh')).toBeNull();
  });
});
