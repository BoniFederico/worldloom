import {
  eraOf,
  formatDate,
  fromDayNumber,
  toDayNumber,
  type Calendar,
  type CalendarDate,
} from '@/lib/calendars/calendar';
import { MAX_ZOOM } from './params';

export type TimelineEvent = {
  id: string;
  title: string;
  start: CalendarDate;
  /** Fine di un evento a intervallo; `null` per un evento puntuale. */
  end: CalendarDate | null;
  categoryIds: string[];
  tags: string[];
};

export type TimelineOptions = {
  lane: 'category' | 'tag';
  zoom: number;
  center: number | null;
  /** Larghezza del disegno in unità SVG. */
  width: number;
  categoryNames: ReadonlyMap<string, string>;
  /** Nome della corsia degli eventi senza categoria (o senza tag). */
  noLaneLabel: string;
};

export type PlacedEvent = {
  id: string;
  title: string;
  x: number;
  /** Ascissa della fine per gli eventi a intervallo, altrimenti `null`. */
  x2: number | null;
  row: number;
  startLabel: string;
  endLabel: string | null;
  categoryId: string | null;
};

export type Lane = { key: string; label: string; rows: number; events: PlacedEvent[] };

export type TimelineLayout = {
  range: { from: number; to: number };
  ticks: { x: number; label: string }[];
  lanes: Lane[];
  lanesTruncated: boolean;
  /** Eventi in totale e quanti restano fuori dalla finestra di zoom. */
  total: number;
  hidden: number;
};

export const MARGIN = 24;
export const MAX_LANES = 30;
const MIN_SPAN_DAYS = 10;
const MAX_TICKS = 40;
const LABEL_CHAR = 7;
const LABEL_MAX = 220;

type Item = { event: TimelineEvent; startDay: number; endDay: number };

const items = (c: Calendar, events: TimelineEvent[]): Item[] =>
  events.map((event) => {
    const startDay = toDayNumber(c, event.start);
    const endDay = event.end ? toDayNumber(c, event.end) : startDay;
    return { event, startDay, endDay: Math.max(startDay, endDay) };
  });

/** Eventi in ordine cronologico (per numero di giorno, non per testo): serve all'alternativa testuale. */
export function sortEvents(c: Calendar, events: TimelineEvent[]): Item[] {
  return items(c, events).sort(
    (a, b) => a.startDay - b.startDay || a.event.id.localeCompare(b.event.id),
  );
}

const niceStep = (raw: number) => {
  const base = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (m * base >= raw) return m * base;
  return 10 * base;
};

const yearLabel = (c: Calendar, year: number) => {
  const era = eraOf(c, year);
  return era ? `${era.yearInEra} ${era.name}` : String(year);
};

function buildTicks(
  c: Calendar,
  range: { from: number; to: number },
  x: (day: number) => number,
): { x: number; label: string }[] {
  const span = range.to - range.from;
  const yearDays =
    c.months.reduce((sum, m) => sum + m.days, 0) + (c.leap ? c.leap.days / c.leap.every : 0);
  const out: { x: number; label: string }[] = [];
  const push = (day: number, label: string) => {
    if (day >= range.from && day <= range.to && out.length < MAX_TICKS) {
      out.push({ x: x(day), label });
    }
  };

  const years = span / yearDays;
  if (years >= 6) {
    const step = niceStep(years / 8);
    const first = fromDayNumber(c, Math.floor(range.from)).year;
    const last = fromDayNumber(c, Math.ceil(range.to)).year;
    for (let year = Math.ceil(first / step) * step; year <= last; year += step) {
      push(toDayNumber(c, { year, month: 1, day: 1 }), yearLabel(c, year));
    }
  } else if (span > 45) {
    let { year, month } = fromDayNumber(c, Math.floor(range.from));
    for (let guard = 0; guard < 400; guard++) {
      const day = toDayNumber(c, { year, month, day: 1 });
      if (day > range.to) break;
      const name = c.months[month - 1]?.name ?? String(month);
      push(day, month === 1 ? `${name} ${yearLabel(c, year)}` : name);
      month++;
      if (month > c.months.length) {
        month = 1;
        year++;
      }
    }
  } else {
    const step = niceStep(span / 10);
    for (let day = Math.ceil(range.from / step) * step; day <= range.to; day += step) {
      const d = fromDayNumber(c, day);
      push(day, `${d.day} ${c.months[d.month - 1]?.name ?? d.month}`);
    }
  }
  return out;
}

/**
 * Disposizione della timeline: finestra (zoom e centro), tacche della scala, corsie per categoria o per tag e righe
 * senza sovrapposizioni. Tutto è calcolato sul server in unità SVG: nessuna libreria nel browser.
 */
export function layoutTimeline(
  c: Calendar,
  events: TimelineEvent[],
  o: TimelineOptions,
): TimelineLayout {
  const all = items(c, events);
  if (!all.length) {
    return {
      range: { from: 0, to: MIN_SPAN_DAYS },
      ticks: [],
      lanes: [],
      lanesTruncated: false,
      total: 0,
      hidden: 0,
    };
  }

  const minDay = Math.min(...all.map((i) => i.startDay));
  const maxDay = Math.max(...all.map((i) => i.endDay));
  const pad = Math.max(5, (maxDay - minDay) * 0.05);
  const fit = { from: minDay - pad, to: maxDay + pad };
  const zoom = Math.min(MAX_ZOOM, Math.max(0, Math.trunc(o.zoom)));
  const span = Math.max(MIN_SPAN_DAYS, (fit.to - fit.from) / 2 ** zoom);
  const middle = o.center === null ? (fit.from + fit.to) / 2 : o.center;
  const center = Math.min(fit.to, Math.max(fit.from, middle));
  const range = { from: center - span / 2, to: center + span / 2 };

  const usable = o.width - 2 * MARGIN;
  const x = (day: number) =>
    MARGIN + (Math.min(range.to, Math.max(range.from, day)) - range.from) * (usable / span);

  const visible = all.filter((i) => i.startDay <= range.to && i.endDay >= range.from);

  // Corsie: per categoria (la prima in ordine alfabetico) o per tag (l'evento compare in ognuna).
  const groups = new Map<string, { label: string; items: Item[]; categoryId: string | null }>();
  const add = (key: string, label: string, item: Item, categoryId: string | null) => {
    const g = groups.get(key) ?? { label, items: [], categoryId };
    g.items.push(item);
    groups.set(key, g);
  };
  const NONE = '\u0000none';
  for (const item of visible) {
    if (o.lane === 'tag') {
      if (!item.event.tags.length) add(NONE, o.noLaneLabel, item, null);
      for (const tag of new Set(item.event.tags)) add(`t:${tag}`, tag, item, null);
    } else {
      const named = item.event.categoryIds
        .filter((id) => o.categoryNames.has(id))
        .map((id) => ({ id, name: o.categoryNames.get(id) ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id));
      const first = named[0];
      if (first) add(`c:${first.id}`, first.name, item, first.id);
      else add(NONE, o.noLaneLabel, item, null);
    }
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === NONE) return 1;
    if (b === NONE) return -1;
    return (
      (groups.get(a)?.label ?? '').localeCompare(groups.get(b)?.label ?? '', 'it') ||
      a.localeCompare(b)
    );
  });

  const lanes: Lane[] = keys.slice(0, MAX_LANES).map((key) => {
    const group = groups.get(key)!;
    const sorted = [...group.items].sort(
      (a, b) => a.startDay - b.startDay || a.event.id.localeCompare(b.event.id),
    );
    const rowEnds: number[] = [];
    const placed: PlacedEvent[] = sorted.map(({ event, startDay, endDay }) => {
      const x1 = x(startDay);
      const x2 = event.end && endDay > startDay ? x(endDay) : null;
      const labelWidth = Math.min(LABEL_MAX, event.title.length * LABEL_CHAR + 12);
      const start = x1 - 6;
      const end = Math.max(x2 ?? x1, x1) + 8 + labelWidth;
      let row = rowEnds.findIndex((last) => last + 4 <= start);
      if (row < 0) row = rowEnds.length;
      rowEnds[row] = end;
      return {
        id: event.id,
        title: event.title,
        x: x1,
        x2,
        row,
        startLabel: formatDate(c, event.start),
        endLabel: x2 !== null && event.end ? formatDate(c, event.end) : null,
        categoryId: group.categoryId,
      };
    });
    return { key, label: group.label, rows: rowEnds.length, events: placed };
  });

  return {
    range,
    ticks: buildTicks(c, range, x),
    lanes,
    lanesTruncated: keys.length > MAX_LANES,
    total: all.length,
    hidden: all.length - visible.length,
  };
}
