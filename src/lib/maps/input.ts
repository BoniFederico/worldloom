import { uuidSchema } from '@/lib/worlds/schemas';

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const uuid = (value: string) => {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export type MapInput = { name: string; place: string | null };
export type MapResult =
  { ok: true; value: MapInput } | { ok: false; error: 'invalid_name' | 'invalid_place' };

/** Nome della mappa e, facoltativo, lo snippet-luogo che raffigura (per le mappe annidate). */
export function parseMapForm(get: (name: string) => string | undefined): MapResult {
  const name = clean(get('name'));
  if (!name || name.length > 80) return { ok: false, error: 'invalid_name' };
  const rawPlace = clean(get('place'));
  if (!rawPlace) return { ok: true, value: { name, place: null } };
  const place = uuid(rawPlace);
  return place ? { ok: true, value: { name, place } } : { ok: false, error: 'invalid_place' };
}

export type PinInput = { snippet: string; x: number; y: number };
export type PinResult =
  { ok: true; value: PinInput } | { ok: false; error: 'invalid_snippet' | 'invalid_coordinates' };

/** Percentuale 0–100 (con virgola o punto) → frazione 0–1 con 4 decimali; `null` se non è un numero in scala. */
function percent(value: string | undefined): number | null {
  const text = clean(value).replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? Math.round(n * 100) / 10000 : null;
}

/** Un pin: lo snippet e la posizione sulla mappa in percentuale della larghezza e dell'altezza. */
export function parsePinForm(get: (name: string) => string | undefined): PinResult {
  const snippet = uuid(clean(get('snippet')));
  if (!snippet) return { ok: false, error: 'invalid_snippet' };
  const x = percent(get('x'));
  const y = percent(get('y'));
  if (x === null || y === null) return { ok: false, error: 'invalid_coordinates' };
  return { ok: true, value: { snippet, x, y } };
}

export const MAX_STOPS = 30;
export type RouteResult =
  | { ok: true; value: { name: string; stops: string[] } }
  | { ok: false; error: 'invalid_route_name' | 'invalid_stops' };

/** Un percorso: nome e tappe (id di pin) in ordine; i campi vuoti si ignorano. */
export function parseRouteForm(name: string, rawStops: string[]): RouteResult {
  const label = clean(name);
  if (!label || label.length > 80) return { ok: false, error: 'invalid_route_name' };
  const filled = rawStops.map(clean).filter((s) => s !== '');
  const stops = filled.map(uuid);
  if (filled.length < 2 || filled.length > MAX_STOPS || stops.some((s) => s === null)) {
    return { ok: false, error: 'invalid_stops' };
  }
  return { ok: true, value: { name: label, stops: stops as string[] } };
}

/** Frazione 0–1 come percentuale per i campi del modulo (senza zeri inutili). */
export const toPercent = (fraction: number) => String(Math.round(fraction * 10000) / 100);
