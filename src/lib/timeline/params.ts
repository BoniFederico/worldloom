import { uuidSchema } from '@/lib/worlds/schemas';

export type TimelineParams = {
  /** Calendario mostrato (id); senza, il primo che ha eventi. */
  calendar: string | null;
  /** Chiave del campo «data in calendario» di inizio; senza, il primo campo di quel tipo. */
  start: string | null;
  /** Chiave del campo di fine (evento a intervallo); senza, gli eventi sono puntuali. */
  end: string | null;
  lane: 'category' | 'tag';
  category: string | null;
  tag: string | null;
  /** Titolo di uno snippet: mostra solo gli eventi collegati a lui da una relazione (personaggio, luogo…). */
  related: string | null;
  /** Livello di ingrandimento: 0 mostra tutto, ogni livello dimezza l'intervallo. */
  zoom: number;
  /** Giorno al centro della finestra (numero di giorno del calendario); senza, il centro dell'intervallo. */
  center: number | null;
};

export const MAX_ZOOM = 8;
export const DEFAULT_TIMELINE: TimelineParams = {
  calendar: null,
  start: null,
  end: null,
  lane: 'category',
  category: null,
  tag: null,
  related: null,
  zoom: 0,
  center: null,
};

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
type Raw = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const clean = (value: string | undefined, max: number) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Parametri della timeline dalla query string: tutto è normalizzato e limitato, mai un errore. */
export function parseTimelineParams(raw: Raw): TimelineParams {
  const calendar = uuidSchema.safeParse(clean(first(raw.calendar), 64));
  const category = uuidSchema.safeParse(clean(first(raw.category), 64));
  const start = clean(first(raw.start), 40);
  const end = clean(first(raw.end), 40);
  const zoomText = clean(first(raw.zoom), 4);
  const centerText = clean(first(raw.center), 16);
  const tag = clean(first(raw.tag), 60);
  const related = clean(first(raw.related), 120);
  return {
    calendar: calendar.success ? calendar.data : null,
    start: KEY.test(start) ? start : null,
    end: KEY.test(end) ? end : null,
    lane: first(raw.lane) === 'tag' ? 'tag' : 'category',
    category: category.success ? category.data : null,
    tag: tag || null,
    related: related || null,
    zoom: /^\d{1,2}$/.test(zoomText) ? Math.min(MAX_ZOOM, Number(zoomText)) : 0,
    center: /^-?\d{1,12}$/.test(centerText) ? Number(centerText) : null,
  };
}

/** Query string con i soli parametri diversi dai valori predefiniti. */
export function timelineQuery(p: TimelineParams): string {
  const qs = new URLSearchParams();
  if (p.calendar) qs.set('calendar', p.calendar);
  if (p.start) qs.set('start', p.start);
  if (p.end) qs.set('end', p.end);
  if (p.lane !== 'category') qs.set('lane', p.lane);
  if (p.category) qs.set('category', p.category);
  if (p.tag) qs.set('tag', p.tag);
  if (p.related) qs.set('related', p.related);
  if (p.zoom) qs.set('zoom', String(p.zoom));
  if (p.center !== null) qs.set('center', String(p.center));
  return qs.toString();
}

/** Configurazione salvata in una vista (jsonb, scrivibile anche da chi usa l'API): stessi limiti della query string. */
export function parseTimelineConfig(input: unknown): TimelineParams {
  const c =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const number = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? String(Math.trunc(v)) : text(v);
  return parseTimelineParams({
    calendar: text(c.calendar),
    start: text(c.start),
    end: text(c.end),
    lane: text(c.lane),
    category: text(c.category),
    tag: text(c.tag),
    related: text(c.related),
    zoom: number(c.zoom),
    center: number(c.center),
  });
}
