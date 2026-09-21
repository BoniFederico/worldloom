import { z } from 'zod';

/**
 * Calendario definito dall'utente: mesi (nome e giorni), giorni della settimana, ere e un anno «lungo» periodico.
 * Le date sono terne {anno, mese, giorno} con anno assoluto intero (l'anno 0 esiste, i negativi sono «prima»);
 * il numero di giorno conta i giorni dall'anno 0, mese 1, giorno 1, ed è la base per ordinare e confrontare.
 * Le ere sono solo etichette: ognuna vale dal suo anno di inizio fino all'era successiva, e l'anno al suo interno
 * si conta da 1. Il calendario è un dato del mondo: la conversione non dipende da lingua o fuso orario.
 */
export type Calendar = {
  months: { name: string; days: number }[];
  weekdays: string[];
  eras: { name: string; start: number }[];
  /** Ogni `every` anni (multipli di `every`, anno 0 incluso) il mese `month` (da 1) ha `days` giorni in più. */
  leap?: { every: number; month: number; days: number } | undefined;
  /** Indice (da 0) del giorno della settimana del giorno d'origine. */
  epochWeekday: number;
};

export type CalendarDate = { year: number; month: number; day: number };

const name = (max: number) => z.string().trim().min(1).max(max);
const lower = (value: string) => value.toLowerCase();

export const calendarSchema = z
  .object({
    months: z
      .array(z.object({ name: name(60), days: z.number().int().min(1).max(400) }))
      .min(1)
      .max(40),
    weekdays: z.array(name(60)).max(20),
    eras: z
      .array(z.object({ name: name(60), start: z.number().int().min(-1_000_000).max(1_000_000) }))
      .max(30),
    leap: z
      .object({
        every: z.number().int().min(2).max(10_000),
        month: z.number().int().min(1).max(40),
        days: z.number().int().min(1).max(100),
      })
      .optional(),
    epochWeekday: z.number().int().min(0).max(19),
  })
  .superRefine((c, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });
    const dup = (values: string[], path: string) => {
      const seen = new Set<string>();
      values.forEach((v, i) => {
        if (seen.has(lower(v))) issue('duplicato', [path, i]);
        seen.add(lower(v));
      });
    };
    dup(
      c.months.map((m) => m.name),
      'months',
    );
    dup(c.weekdays, 'weekdays');
    dup(
      c.eras.map((e) => e.name),
      'eras',
    );
    if (new Set(c.eras.map((e) => e.start)).size !== c.eras.length)
      issue('anno duplicato', ['eras']);
    if (c.leap && c.leap.month > c.months.length) issue('mese inesistente', ['leap', 'month']);
    if (c.epochWeekday >= Math.max(c.weekdays.length, 1))
      issue('giorno inesistente', ['epochWeekday']);
  })
  .transform((c) => ({ ...c, eras: [...c.eras].sort((a, b) => a.start - b.start) }));

const mod = (n: number, m: number) => ((n % m) + m) % m;
const isLong = (c: Calendar, year: number) => !!c.leap && mod(year, c.leap.every) === 0;
const baseYear = (c: Calendar) => c.months.reduce((sum, m) => sum + m.days, 0);

export function daysInMonth(c: Calendar, year: number, month: number): number {
  const base = c.months[month - 1]?.days ?? 0;
  return c.leap && c.leap.month === month && isLong(c, year) ? base + c.leap.days : base;
}

export function daysInYear(c: Calendar, year: number): number {
  return baseYear(c) + (c.leap && isLong(c, year) ? c.leap.days : 0);
}

/** Anni lunghi in [0, year) (negativo se year < 0): differenza tra i conteggi di due anni = anni lunghi tra loro. */
const longYearsBefore = (every: number, year: number) => Math.floor((year - 1) / every) + 1;
const daysBeforeYear = (c: Calendar, year: number) =>
  year * baseYear(c) + (c.leap ? longYearsBefore(c.leap.every, year) * c.leap.days : 0);

export function isValidDate(c: Calendar, d: CalendarDate): boolean {
  return (
    Number.isSafeInteger(d.year) &&
    Number.isInteger(d.month) &&
    Number.isInteger(d.day) &&
    d.month >= 1 &&
    d.month <= c.months.length &&
    d.day >= 1 &&
    d.day <= daysInMonth(c, d.year, d.month)
  );
}

/** Giorni dall'origine (anno 0, mese 1, giorno 1). La data va prima validata con `isValidDate`. */
export function toDayNumber(c: Calendar, d: CalendarDate): number {
  let n = daysBeforeYear(c, d.year);
  for (let m = 1; m < d.month; m++) n += daysInMonth(c, d.year, m);
  return n + d.day - 1;
}

export function fromDayNumber(c: Calendar, n: number): CalendarDate {
  if (!Number.isSafeInteger(n)) throw new RangeError('numero di giorno non valido');
  const average = baseYear(c) + (c.leap ? c.leap.days / c.leap.every : 0);
  let year = Math.floor(n / average);
  // La stima è vicina: si corregge al massimo di un paio di anni.
  while (daysBeforeYear(c, year) > n) year--;
  while (daysBeforeYear(c, year + 1) <= n) year++;
  let rest = n - daysBeforeYear(c, year);
  for (let month = 1; month <= c.months.length; month++) {
    const length = daysInMonth(c, year, month);
    if (rest < length) return { year, month, day: rest + 1 };
    rest -= length;
  }
  throw new Error('unreachable');
}

export function addDays(c: Calendar, d: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(c, toDayNumber(c, d) + days);
}

export function weekdayOf(c: Calendar, d: CalendarDate): string | null {
  if (!c.weekdays.length) return null;
  return c.weekdays[mod(toDayNumber(c, d) + c.epochWeekday, c.weekdays.length)] ?? null;
}

export function eraOf(c: Calendar, year: number): { name: string; yearInEra: number } | null {
  let found: Calendar['eras'][number] | undefined;
  for (const era of c.eras) if (era.start <= year) found = era;
  return found ? { name: found.name, yearInEra: year - found.start + 1 } : null;
}

export const findEra = (c: Calendar, era: string) =>
  c.eras.find((e) => lower(e.name) === lower(era.trim()));

/** Anno assoluto da (era, anno nell'era, da 1); senza era l'anno è già assoluto. `null` se l'era non esiste o l'anno è < 1. */
export function resolveYear(c: Calendar, era: string, yearInEra: number): number | null {
  if (!era) return yearInEra;
  const found = findEra(c, era);
  return found && yearInEra >= 1 ? found.start + yearInEra - 1 : null;
}

export function formatDate(c: Calendar, d: CalendarDate): string {
  const month = c.months[d.month - 1]?.name ?? String(d.month);
  const era = eraOf(c, d.year);
  const year = era ? `${era.yearInEra} ${era.name}` : String(d.year);
  return `${d.day} ${month} ${year}`;
}
