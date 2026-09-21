import {
  calendarSchema,
  eraOf,
  findEra,
  isValidDate,
  resolveYear,
  type Calendar,
  type CalendarDate,
} from './calendar';

export type CalendarError =
  | 'invalid_name'
  | 'invalid_months'
  | 'invalid_weekdays'
  | 'invalid_eras'
  | 'invalid_leap'
  | 'invalid_epoch';

export type CalendarFormResult =
  { ok: true; value: { name: string; calendar: Calendar } } | { ok: false; error: CalendarError };

const clean = (value: string | undefined) => (value ?? '').replace(/[ \t]+/g, ' ').trim();
const lines = (value: string | undefined) =>
  (value ?? '')
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l !== '');

/** «Nome, numero» → coppia; il nome può contenere virgole (si usa l'ultima). `null` se il numero non è intero. */
function pair(line: string): [string, number] | null {
  const at = line.lastIndexOf(',');
  if (at < 1) return null;
  const label = clean(line.slice(0, at));
  const text = clean(line.slice(at + 1));
  if (!label || !/^-?\d{1,9}$/.test(text)) return null;
  return [label, Number(text)];
}

const optionalInt = (value: string | undefined): number | null | undefined => {
  const text = clean(value);
  if (text === '') return null;
  return /^-?\d{1,9}$/.test(text) ? Number(text) : undefined;
};

/** Legge un calendario dai campi di un form (mesi e ere una per riga, giorni della settimana separati da virgola). */
export function parseCalendarForm(get: (name: string) => string | undefined): CalendarFormResult {
  const name = clean(get('name'));
  if (!name || name.length > 80) return { ok: false, error: 'invalid_name' };

  const months = [];
  for (const line of lines(get('months'))) {
    const p = pair(line);
    if (!p) return { ok: false, error: 'invalid_months' };
    months.push({ name: p[0], days: p[1] });
  }
  const eras = [];
  for (const line of lines(get('eras'))) {
    const p = pair(line);
    if (!p) return { ok: false, error: 'invalid_eras' };
    eras.push({ name: p[0], start: p[1] });
  }
  const weekdays = (get('weekdays') ?? '')
    .split(/[,\n]/)
    .map(clean)
    .filter((w) => w !== '');

  const every = optionalInt(get('leapEvery'));
  const month = optionalInt(get('leapMonth'));
  const days = optionalInt(get('leapDays'));
  if (every === undefined || month === undefined || days === undefined) {
    return { ok: false, error: 'invalid_leap' };
  }
  // Anno lungo tutto o niente: campi compilati a metà sono un errore, non vengono ignorati.
  if ((every === null) !== (month === null) || (every === null) !== (days === null)) {
    return { ok: false, error: 'invalid_leap' };
  }

  const epoch = optionalInt(get('epochWeekday'));
  if (
    epoch === undefined ||
    (epoch !== null && (epoch < 1 || epoch > Math.max(weekdays.length, 1)))
  ) {
    return { ok: false, error: 'invalid_epoch' };
  }

  const parsed = calendarSchema.safeParse({
    months,
    weekdays,
    eras,
    ...(every !== null && month !== null && days !== null ? { leap: { every, month, days } } : {}),
    epochWeekday: (epoch ?? 1) - 1,
  });
  if (!parsed.success) {
    const head = parsed.error.issues[0]?.path[0];
    const error: CalendarError =
      head === 'months'
        ? 'invalid_months'
        : head === 'weekdays'
          ? 'invalid_weekdays'
          : head === 'eras'
            ? 'invalid_eras'
            : head === 'leap'
              ? 'invalid_leap'
              : 'invalid_epoch';
    return { ok: false, error };
  }
  return { ok: true, value: { name, calendar: parsed.data } };
}

/** Il contrario di `parseCalendarForm`: i valori per riempire i campi di modifica. */
export function calendarToForm(c: Calendar) {
  return {
    months: c.months.map((m) => `${m.name}, ${m.days}`).join('\n'),
    weekdays: c.weekdays.join(', '),
    eras: c.eras.map((e) => `${e.name}, ${e.start}`).join('\n'),
    leapEvery: c.leap ? String(c.leap.every) : '',
    leapMonth: c.leap ? String(c.leap.month) : '',
    leapDays: c.leap ? String(c.leap.days) : '',
    epochWeekday: String(c.epochWeekday + 1),
  };
}

export type CalendarDateInput = { era?: string; year: string; month: string; day: string };
export type CalendarDateResult = { ok: true; value: '' | CalendarDateValue } | { ok: false };
export type CalendarDateValue = CalendarDate & { calendar: string; era?: string };

const int = (value: string) => (/^-?\d{1,9}$/.test(value.trim()) ? Number(value) : null);

/** Compone il valore di un campo «data in calendario» dai campi del form (era e anno nell'era, mese, giorno). */
export function calendarDateFromInput(
  c: Calendar,
  calendarId: string,
  input: CalendarDateInput,
): CalendarDateResult {
  const era = clean(input.era);
  const year = clean(input.year);
  const month = clean(input.month);
  const day = clean(input.day);
  if (!year && !month && !day) return era ? { ok: false } : { ok: true, value: '' };

  const yearInEra = int(year);
  const monthNumber = int(month);
  const dayNumber = int(day);
  if (yearInEra === null || monthNumber === null || dayNumber === null) return { ok: false };
  const absolute = resolveYear(c, era, yearInEra);
  if (absolute === null) return { ok: false };
  const date = { year: absolute, month: monthNumber, day: dayNumber };
  if (!isValidDate(c, date)) return { ok: false };
  const eraName = era ? findEra(c, era)?.name : undefined;
  return {
    ok: true,
    value: { calendar: calendarId, ...date, ...(eraName ? { era: eraName } : {}) },
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Il valore salvato come testo per i campi del form; `null` se non è una data in calendario. */
export function calendarDateToInput(c: Calendar, value: unknown) {
  const v = record(value);
  if (
    !v ||
    typeof v.year !== 'number' ||
    typeof v.month !== 'number' ||
    typeof v.day !== 'number'
  ) {
    return null;
  }
  const era = eraOf(c, v.year);
  return {
    calendar: typeof v.calendar === 'string' ? v.calendar : '',
    era: era?.name ?? '',
    year: String(era ? era.yearInEra : v.year),
    month: String(v.month),
    day: String(v.day),
  };
}
