import {
  isValidDate,
  toDayNumber,
  type Calendar,
  type CalendarDate,
} from '@/lib/calendars/calendar';
import { loadCalendars, type NamedCalendar } from '@/lib/calendars/load';
import { fieldsSchema } from '@/lib/fields/fields';
import type { createClient } from '@/lib/supabase/server';
import type { TimelineEvent } from './layout';
import type { TimelineParams } from './params';

type Client = Awaited<ReturnType<typeof createClient>>;

export const TIMELINE_LIMIT = 500;
/** Al massimo tanti snippet collegati nel filtro «collegato a» (gli id finiscono nell'indirizzo della richiesta). */
export const RELATED_LIMIT = 150;

export type DateField = { key: string; label: string };
export type TimelineCategory = { id: string; name: string; color: string | null };

export type TimelineData = {
  categories: TimelineCategory[];
  calendars: NamedCalendar[];
  dateFields: DateField[];
  /** Scelte effettive dopo aver applicato i predefiniti (primo calendario, primo campo data). */
  calendar: NamedCalendar | null;
  startKey: string | null;
  endKey: string | null;
  events: TimelineEvent[];
  /** Ci sono altri eventi oltre i primi `TIMELINE_LIMIT`. */
  truncated: boolean;
  /** Snippet con la data in un altro calendario o non valida nel calendario scelto: non si possono collocare. */
  skipped: number;
  /** Il filtro «collegato a» non corrisponde a nessuno snippet leggibile. */
  relatedMissing: boolean;
};

/** Caratteri speciali di `ilike` resi letterali: il titolo si confronta per uguaglianza senza badare alle maiuscole. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_'); // in PostgREST anche `*` fa da jolly

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Legge un valore «data in calendario» di un campo, se appartiene al calendario dato e la data esiste. */
export function readCalendarDate(c: NamedCalendar, value: unknown): CalendarDate | null {
  const v = asRecord(value);
  if (!v || v.calendar !== c.id) return null;
  const { year, month, day } = v;
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return null;
  const date = { year, month, day };
  return isValidDate(c.calendar as Calendar, date) ? date : null;
}

/** Fine di un evento a intervallo: se manca, non esiste nel calendario o precede l'inizio l'evento è puntuale. */
export function eventEnd(
  c: NamedCalendar,
  start: CalendarDate,
  value: unknown,
): CalendarDate | null {
  const end = readCalendarDate(c, value);
  if (!end) return null;
  return toDayNumber(c.calendar, end) < toDayNumber(c.calendar, start) ? null : end;
}

/** Un tag che PostgREST non sa scrivere in un letterale di array si filtra in memoria invece di far fallire la richiesta. */
const SAFE_TAG = /^[^{}",\\]+$/;

/**
 * Eventi della timeline con i permessi di chi guarda (RLS): snippet con un campo «data in calendario» di inizio,
 * e un secondo campo facoltativo di fine. Filtri: categoria, tag e «collegato a» (snippet legati da una relazione).
 */
export async function loadTimeline(
  supabase: Client,
  worldId: string,
  p: TimelineParams,
): Promise<TimelineData | null> {
  const [{ data: cats, error }, calendars] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, color, fields_schema')
      .eq('world_id', worldId)
      .order('name'),
    loadCalendars(supabase, worldId),
  ]);
  if (error) return null;

  const categories = (cats ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const fields = new Map<string, string>();
  for (const c of cats ?? []) {
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const f of parsed.data)
      if (f.type === 'calendar_date' && !fields.has(f.key)) fields.set(f.key, f.label);
  }
  const dateFields = [...fields].map(([key, label]) => ({ key, label }));

  const calendar = calendars.find((c) => c.id === p.calendar) ?? calendars[0] ?? null;
  const startKey = dateFields.find((f) => f.key === p.start)?.key ?? dateFields[0]?.key ?? null;
  const endKey = dateFields.find((f) => f.key === p.end && f.key !== startKey)?.key ?? null;
  const base = {
    categories,
    calendars,
    dateFields,
    calendar,
    startKey,
    endKey,
    events: [] as TimelineEvent[],
    truncated: false,
    skipped: 0,
    relatedMissing: false,
  };
  if (!calendar || !startKey) return base;

  // «Collegato a»: lo snippet con quel titolo e i suoi vicini (relazioni nei due versi).
  let onlyIds: string[] | null = null;
  if (p.related) {
    const { data: target } = await supabase
      .from('snippets')
      .select('id')
      .eq('world_id', worldId)
      .is('deleted_at', null)
      .ilike('title', escapeLike(p.related))
      .order('id')
      .limit(1)
      .maybeSingle();
    if (!target) return { ...base, relatedMissing: true };
    const { data: rels } = await supabase
      .from('relations')
      .select('source_id, target_id')
      .eq('world_id', worldId)
      .or(`source_id.eq.${target.id},target_id.eq.${target.id}`)
      .limit(2000);
    const neighbours = [...new Set((rels ?? []).flatMap((r) => [r.source_id, r.target_id]))].filter(
      (id) => id !== target.id,
    );
    onlyIds = [target.id, ...neighbours.slice(0, RELATED_LIMIT - 1)];
  }

  const select = (
    p.category
      ? 'id, title, tags, fields, snippet_categories(category_id), category_filter:snippet_categories!inner(category_id)'
      : 'id, title, tags, fields, snippet_categories(category_id)'
  ) as 'id, title, tags, fields, snippet_categories(category_id)';
  let query = supabase
    .from('snippets')
    .select(select)
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .not(`fields->${startKey}`, 'is', null);
  if (p.category) query = query.eq('category_filter.category_id', p.category);
  const tag = p.tag;
  if (tag && SAFE_TAG.test(tag)) query = query.contains('tags', [tag]);
  if (onlyIds) query = query.in('id', onlyIds);
  const { data, error: queryError } = await query.order('id').limit(TIMELINE_LIMIT + 1);
  if (queryError) return null;

  const rows = data ?? [];
  const events: TimelineEvent[] = [];
  let skipped = 0;
  for (const row of rows.slice(0, TIMELINE_LIMIT)) {
    if (tag && !SAFE_TAG.test(tag) && !row.tags.includes(tag)) continue;
    const values = asRecord(row.fields) ?? {};
    const start = readCalendarDate(calendar, values[startKey]);
    if (!start) {
      skipped++;
      continue;
    }
    events.push({
      id: row.id,
      title: row.title,
      start,
      end: endKey ? eventEnd(calendar, start, values[endKey]) : null,
      categoryIds: row.snippet_categories.map((c) => c.category_id),
      tags: row.tags,
    });
  }
  return { ...base, events, truncated: rows.length > TIMELINE_LIMIT, skipped };
}
