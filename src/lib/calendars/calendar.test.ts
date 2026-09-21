import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarSchema,
  daysInMonth,
  daysInYear,
  eraOf,
  formatDate,
  fromDayNumber,
  isValidDate,
  resolveYear,
  toDayNumber,
  weekdayOf,
  type Calendar,
} from './calendar';

const gregorian: Calendar = {
  months: [
    { name: 'Gennaio', days: 31 },
    { name: 'Febbraio', days: 28 },
    { name: 'Marzo', days: 31 },
    { name: 'Aprile', days: 30 },
    { name: 'Maggio', days: 31 },
    { name: 'Giugno', days: 30 },
    { name: 'Luglio', days: 31 },
    { name: 'Agosto', days: 31 },
    { name: 'Settembre', days: 30 },
    { name: 'Ottobre', days: 31 },
    { name: 'Novembre', days: 30 },
    { name: 'Dicembre', days: 31 },
  ],
  weekdays: [],
  eras: [],
  leap: { every: 4, month: 2, days: 1 },
  epochWeekday: 0,
};

// Calendario di fantasia: 3 mesi di 20 giorni, 5 giorni della settimana, due ere, anno lungo ogni 3 anni.
const fantasy: Calendar = {
  months: [
    { name: 'Alba', days: 20 },
    { name: 'Zenit', days: 20 },
    { name: 'Vespro', days: 20 },
  ],
  weekdays: ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque'],
  eras: [
    { name: 'Prima Era', start: -500 },
    { name: 'Seconda Era', start: 100 },
  ],
  leap: { every: 3, month: 3, days: 2 },
  epochWeekday: 1,
};

describe('lunghezze', () => {
  it('conta i giorni del mese e dell’anno con l’anno lungo', () => {
    expect(daysInMonth(gregorian, 2024, 2)).toBe(29);
    expect(daysInMonth(gregorian, 2023, 2)).toBe(28);
    expect(daysInYear(gregorian, 2024)).toBe(366);
    expect(daysInYear(fantasy, 3)).toBe(62);
    expect(daysInYear(fantasy, 4)).toBe(60);
    expect(daysInYear(fantasy, -3)).toBe(62);
    expect(daysInYear(fantasy, -2)).toBe(60);
  });
});

describe('conversione da e verso il numero di giorno', () => {
  it('l’origine è l’anno 0, mese 1, giorno 1', () => {
    expect(toDayNumber(fantasy, { year: 0, month: 1, day: 1 })).toBe(0);
    expect(fromDayNumber(fantasy, 0)).toEqual({ year: 0, month: 1, day: 1 });
  });

  it('avanza di un giorno alla volta attraverso mesi e anni lunghi', () => {
    let day = 0;
    let date = fromDayNumber(fantasy, day);
    for (let i = 0; i < 400; i++) {
      const next = fromDayNumber(fantasy, ++day);
      expect(toDayNumber(fantasy, next)).toBe(day);
      const sameMonth = next.year === date.year && next.month === date.month;
      if (sameMonth) expect(next.day).toBe(date.day + 1);
      else expect(next.day).toBe(1);
      date = next;
    }
  });

  it('è coerente per anni negativi', () => {
    for (const n of [-1, -2, -61, -62, -63, -1000, -100000]) {
      const date = fromDayNumber(fantasy, n);
      expect(isValidDate(fantasy, date)).toBe(true);
      expect(toDayNumber(fantasy, date)).toBe(n);
    }
    // L’anno -3 è lungo (multiplo di 3): il suo ultimo mese ha 22 giorni, l’anno -1 no.
    expect(fromDayNumber(fantasy, -1)).toEqual({ year: -1, month: 3, day: 20 });
  });

  it('il calendario gregoriano semplificato dà le durate note', () => {
    const a = toDayNumber(gregorian, { year: 2024, month: 3, day: 1 });
    const b = toDayNumber(gregorian, { year: 2024, month: 2, day: 28 });
    expect(a - b).toBe(2);
    const next = toDayNumber(gregorian, { year: 2025, month: 1, day: 1 });
    expect(next - toDayNumber(gregorian, { year: 2024, month: 1, day: 1 })).toBe(366);
  });

  it('senza anni lunghi gli anni hanno tutti la stessa durata', () => {
    const plain: Calendar = { ...fantasy, leap: undefined };
    expect(toDayNumber(plain, { year: 10, month: 1, day: 1 })).toBe(600);
    expect(fromDayNumber(plain, 600)).toEqual({ year: 10, month: 1, day: 1 });
  });

  it('aggiunge giorni', () => {
    // L’anno 0 è lungo (0 è multiplo di 3): il mese 3 ha 22 giorni.
    expect(addDays(fantasy, { year: 0, month: 3, day: 22 }, 1)).toEqual({
      year: 1,
      month: 1,
      day: 1,
    });
    expect(addDays(fantasy, { year: 0, month: 1, day: 1 }, -1)).toEqual({
      year: -1,
      month: 3,
      day: 20,
    });
  });
});

describe('validazione', () => {
  it('accetta solo mesi e giorni esistenti', () => {
    expect(isValidDate(fantasy, { year: 5, month: 3, day: 20 })).toBe(true);
    expect(isValidDate(fantasy, { year: 5, month: 4, day: 1 })).toBe(false);
    expect(isValidDate(fantasy, { year: 5, month: 1, day: 21 })).toBe(false);
    expect(isValidDate(fantasy, { year: 5, month: 0, day: 1 })).toBe(false);
    expect(isValidDate(fantasy, { year: 5.5, month: 1, day: 1 })).toBe(false);
    // I giorni in più esistono solo negli anni lunghi.
    expect(isValidDate(fantasy, { year: 3, month: 3, day: 22 })).toBe(true);
    expect(isValidDate(fantasy, { year: 4, month: 3, day: 22 })).toBe(false);
  });
});

describe('giorni della settimana', () => {
  it('cicla sui nomi a partire dal giorno d’origine', () => {
    expect(weekdayOf(fantasy, { year: 0, month: 1, day: 1 })).toBe('Due');
    expect(weekdayOf(fantasy, { year: 0, month: 1, day: 5 })).toBe('Uno');
    expect(weekdayOf(fantasy, { year: -1, month: 3, day: 20 })).toBe('Uno');
    expect(weekdayOf(gregorian, { year: 0, month: 1, day: 1 })).toBeNull();
  });
});

describe('ere', () => {
  it('trova l’era e l’anno al suo interno', () => {
    expect(eraOf(fantasy, 100)).toEqual({ name: 'Seconda Era', yearInEra: 1 });
    expect(eraOf(fantasy, 250)).toEqual({ name: 'Seconda Era', yearInEra: 151 });
    expect(eraOf(fantasy, 99)).toEqual({ name: 'Prima Era', yearInEra: 600 });
    expect(eraOf(fantasy, -501)).toBeNull();
  });

  it('risolve l’anno assoluto da era e anno nell’era', () => {
    expect(resolveYear(fantasy, 'Seconda Era', 12)).toBe(111);
    expect(resolveYear(fantasy, '', 12)).toBe(12);
    expect(resolveYear(fantasy, 'Terza Era', 1)).toBeNull();
  });
});

describe('formato', () => {
  it('scrive giorno, mese, anno e era', () => {
    expect(formatDate(fantasy, { year: 111, month: 2, day: 7 })).toBe('7 Zenit 12 Seconda Era');
    expect(formatDate(gregorian, { year: 2024, month: 2, day: 29 })).toBe('29 Febbraio 2024');
    expect(formatDate(fantasy, { year: -600, month: 1, day: 1 })).toBe('1 Alba -600');
  });
});

describe('definizione del calendario', () => {
  it('accetta una definizione valida', () => {
    expect(calendarSchema.safeParse(fantasy).success).toBe(true);
    expect(calendarSchema.safeParse(gregorian).success).toBe(true);
  });

  it('rifiuta mesi vuoti, giorni fuori scala, nomi duplicati e ere duplicate', () => {
    const bad = (patch: Partial<Calendar>) =>
      calendarSchema.safeParse({ ...fantasy, ...patch }).success;
    expect(bad({ months: [] })).toBe(false);
    expect(bad({ months: [{ name: 'A', days: 0 }] })).toBe(false);
    expect(bad({ months: [{ name: 'A', days: 1000 }] })).toBe(false);
    expect(
      bad({
        months: [
          { name: 'A', days: 5 },
          { name: 'a', days: 5 },
        ],
      }),
    ).toBe(false);
    expect(
      bad({
        eras: [
          { name: 'X', start: 0 },
          { name: 'x', start: 5 },
        ],
      }),
    ).toBe(false);
    expect(
      bad({
        eras: [
          { name: 'X', start: 0 },
          { name: 'Y', start: 0 },
        ],
      }),
    ).toBe(false);
    expect(bad({ leap: { every: 0, month: 1, days: 1 } })).toBe(false);
    expect(bad({ leap: { every: 4, month: 9, days: 1 } })).toBe(false);
    expect(bad({ epochWeekday: 5 })).toBe(false);
  });

  it('ordina le ere per anno di inizio', () => {
    const parsed = calendarSchema.parse({
      ...fantasy,
      eras: [
        { name: 'B', start: 100 },
        { name: 'A', start: -5 },
      ],
    });
    expect(parsed.eras.map((e) => e.name)).toEqual(['A', 'B']);
  });
});
