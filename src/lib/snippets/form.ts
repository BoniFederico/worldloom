import type { Calendar } from '@/lib/calendars/calendar';
import { calendarDateFromInput } from '@/lib/calendars/input';
import type { FieldDefinition, FieldType } from '@/lib/fields/fields';

/**
 * Tipi che il form dello snippet sa modificare. Coordinate e immagine hanno editor dedicati nelle viste che
 * li usano (mappa): qui i loro valori si conservano e basta.
 */
export const EDITABLE_TYPES: FieldType[] = [
  'text',
  'number',
  'date',
  'calendar_date',
  'choice',
  'snippet_ref',
];

export const fieldInputName = (key: string) => `f:${key}`;
/** Campi di una data in calendario: `f:<chiave>:calendar|era|year|month|day`. */
export const dateInputName = (key: string, part: 'calendar' | 'era' | 'year' | 'month' | 'day') =>
  `f:${key}:${part}`;

/**
 * Unisce i valori esistenti con quelli inviati dal form. Un campo presente nel form ma vuoto sovrascrive
 * (si svuota); un campo assente dal form o di tipo non modificabile mantiene il valore. Le chiavi che
 * nessuna categoria definisce (orfane) restano intatte. Una data in calendario non valida (giorno inesistente,
 * calendario sconosciuto) diventa `{ invalid: true }`, che la validazione dei campi rifiuta.
 */
export function mergeFieldInput(
  defs: FieldDefinition[],
  existing: Record<string, unknown>,
  get: (name: string) => string | undefined,
  calendars: ReadonlyMap<string, Calendar> = new Map(),
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...existing };
  for (const def of defs) {
    if (!EDITABLE_TYPES.includes(def.type)) continue;
    if (def.type === 'calendar_date') {
      const part = (name: 'calendar' | 'era' | 'year' | 'month' | 'day') =>
        get(dateInputName(def.key, name));
      if (part('year') === undefined && part('month') === undefined && part('day') === undefined) {
        continue;
      }
      const id = (part('calendar') ?? '').trim();
      const calendar = calendars.get(id);
      const parts = {
        era: part('era') ?? '',
        year: part('year') ?? '',
        month: part('month') ?? '',
        day: part('day') ?? '',
      };
      if (!calendar) {
        const empty =
          !parts.year.trim() && !parts.month.trim() && !parts.day.trim() && !parts.era.trim();
        input[def.key] = empty ? '' : { invalid: true };
        continue;
      }
      const result = calendarDateFromInput(calendar, id, parts);
      input[def.key] = result.ok ? result.value : { invalid: true };
      continue;
    }
    const raw = get(fieldInputName(def.key));
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value === '') input[def.key] = '';
    else input[def.key] = def.type === 'number' ? Number(value) : value;
  }
  return input;
}
