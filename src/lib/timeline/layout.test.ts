import { describe, expect, it } from 'vitest';
import { toDayNumber, type Calendar } from '@/lib/calendars/calendar';
import { layoutTimeline, sortEvents, type TimelineEvent, type TimelineOptions } from './layout';

// 4 mesi di 30 giorni = 120 giorni all'anno, una sola era.
const cal: Calendar = {
  months: [
    { name: 'Alba', days: 30 },
    { name: 'Sole', days: 30 },
    { name: 'Messe', days: 30 },
    { name: 'Bruma', days: 30 },
  ],
  weekdays: [],
  eras: [{ name: 'Era Nuova', start: 100 }],
  epochWeekday: 0,
};

const ev = (
  id: string,
  year: number,
  extra: Partial<TimelineEvent> & { endYear?: number } = {},
): TimelineEvent => ({
  id,
  title: id,
  start: { year, month: 1, day: 1 },
  end: extra.endYear === undefined ? null : { year: extra.endYear, month: 1, day: 1 },
  categoryIds: extra.categoryIds ?? [],
  tags: extra.tags ?? [],
});

const options = (patch: Partial<TimelineOptions> = {}): TimelineOptions => ({
  lane: 'category',
  zoom: 0,
  center: null,
  width: 960,
  categoryNames: new Map([
    ['c-luoghi', 'Luoghi'],
    ['c-persone', 'Persone'],
  ]),
  noLaneLabel: 'Senza corsia',
  ...patch,
});

describe('finestra e zoom', () => {
  const events = [ev('a', 100), ev('b', 200), ev('c', 300)];

  it('senza zoom mostra tutti gli eventi con un po’ di margine', () => {
    const l = layoutTimeline(cal, events, options());
    const from = toDayNumber(cal, { year: 100, month: 1, day: 1 });
    const to = toDayNumber(cal, { year: 300, month: 1, day: 1 });
    expect(l.range.from).toBeLessThan(from);
    expect(l.range.to).toBeGreaterThan(to);
    expect(l.hidden).toBe(0);
    expect(l.lanes.flatMap((x) => x.events)).toHaveLength(3);
  });

  it('ogni livello di zoom dimezza la finestra e la tiene attorno al centro', () => {
    const full = layoutTimeline(cal, events, options()).range;
    const z1 = layoutTimeline(cal, events, options({ zoom: 1 })).range;
    const z2 = layoutTimeline(cal, events, options({ zoom: 2 })).range;
    const span = (r: { from: number; to: number }) => r.to - r.from;
    expect(span(z1)).toBeCloseTo(span(full) / 2, 5);
    expect(span(z2)).toBeCloseTo(span(full) / 4, 5);
    const middle = (full.from + full.to) / 2;
    expect((z1.from + z1.to) / 2).toBeCloseTo(middle, 5);
  });

  it('con il centro su un evento la finestra lo contiene e gli altri restano fuori (contati)', () => {
    const day = toDayNumber(cal, { year: 100, month: 1, day: 1 });
    const l = layoutTimeline(cal, events, options({ zoom: 4, center: day }));
    const shown = l.lanes.flatMap((x) => x.events).map((e) => e.id);
    expect(shown).toContain('a');
    expect(shown).not.toContain('c');
    expect(l.hidden).toBe(3 - shown.length);
    expect(l.total).toBe(3);
  });

  it('il centro fuori dagli eventi viene riportato dentro; la finestra non si riduce sotto i 10 giorni', () => {
    const l = layoutTimeline(cal, events, options({ zoom: 8, center: 10 ** 9 }));
    expect(l.range.to - l.range.from).toBeGreaterThanOrEqual(10);
    expect(l.range.to).toBeLessThan(10 ** 6);
  });

  it('un solo evento o nessuno non rompe il calcolo', () => {
    const one = layoutTimeline(cal, [ev('solo', 150)], options());
    expect(one.range.to).toBeGreaterThan(one.range.from);
    expect(one.lanes.flatMap((x) => x.events)).toHaveLength(1);
    const none = layoutTimeline(cal, [], options());
    expect(none.lanes).toEqual([]);
    expect(none.ticks).toEqual([]);
  });
});

describe('eventi puntuali e a intervallo', () => {
  it('l’intervallo ha una seconda ascissa, il punto no; la fine prima dell’inizio diventa un punto', () => {
    const l = layoutTimeline(
      cal,
      [ev('punto', 100), ev('periodo', 120, { endYear: 180 }), ev('storto', 150, { endYear: 140 })],
      options(),
    );
    const byId = Object.fromEntries(l.lanes.flatMap((x) => x.events).map((e) => [e.id, e]));
    expect(byId.punto?.x2).toBeNull();
    expect(byId.periodo?.x2).toBeGreaterThan(byId.periodo?.x ?? 0);
    expect(byId.storto?.x2).toBeNull();
    expect(byId.periodo?.endLabel).toContain('Era Nuova');
  });
});

describe('corsie', () => {
  it('per categoria: ordinate per nome, «senza corsia» in fondo, righe separate se si sovrappongono', () => {
    const l = layoutTimeline(
      cal,
      [
        ev('a', 100, { categoryIds: ['c-persone'] }),
        ev('b', 100, { categoryIds: ['c-persone'] }),
        ev('c', 300, { categoryIds: ['c-persone'] }),
        ev('d', 200, { categoryIds: ['c-luoghi'] }),
        ev('e', 250),
      ],
      options(),
    );
    expect(l.lanes.map((x) => x.label)).toEqual(['Luoghi', 'Persone', 'Senza corsia']);
    const persone = l.lanes[1]!;
    const rows = Object.fromEntries(persone.events.map((e) => [e.id, e.row]));
    expect(rows.a).not.toBe(rows.b); // stessa data: si sovrappongono
    expect(rows.c).toBe(0); // lontano: riusa la prima riga
    expect(persone.rows).toBe(2);
  });

  it('per tag: un evento compare in ogni sua corsia', () => {
    const l = layoutTimeline(
      cal,
      [
        ev('a', 100, { tags: ['guerra', 'nord'] }),
        ev('b', 200, { tags: ['guerra'] }),
        ev('c', 300),
      ],
      options({ lane: 'tag' }),
    );
    expect(l.lanes.map((x) => [x.label, x.events.length])).toEqual([
      ['guerra', 2],
      ['nord', 1],
      ['Senza corsia', 1],
    ]);
    expect(l.total).toBe(3);
  });

  it('al massimo 30 corsie', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      ev(`e${i}`, 100 + i, { tags: [`t${String(i).padStart(2, '0')}`] }),
    );
    const l = layoutTimeline(cal, many, options({ lane: 'tag' }));
    expect(l.lanes).toHaveLength(30);
    expect(l.lanesTruncated).toBe(true);
  });
});

describe('scala', () => {
  it('su molti anni le tacche sono anni, con il nome dell’era, e stanno nella finestra', () => {
    const l = layoutTimeline(cal, [ev('a', 100), ev('b', 300)], options());
    expect(l.ticks.length).toBeGreaterThan(2);
    expect(l.ticks.length).toBeLessThanOrEqual(40);
    expect(l.ticks.every((t) => t.x >= 0 && t.x <= 960)).toBe(true);
    expect(l.ticks.some((t) => t.label.includes('Era Nuova'))).toBe(true);
    const xs = l.ticks.map((t) => t.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('su pochi mesi le tacche sono mesi e su pochi giorni sono giorni', () => {
    const months = layoutTimeline(
      cal,
      [
        { ...ev('a', 100), start: { year: 100, month: 1, day: 5 } },
        { ...ev('b', 100), start: { year: 100, month: 4, day: 5 } },
      ],
      options(),
    );
    expect(months.ticks.some((t) => t.label.startsWith('Sole'))).toBe(true);
    const days = layoutTimeline(
      cal,
      [
        { ...ev('a', 100), start: { year: 100, month: 1, day: 5 } },
        { ...ev('b', 100), start: { year: 100, month: 1, day: 15 } },
      ],
      options(),
    );
    expect(days.ticks.length).toBeGreaterThan(3);
    expect(days.ticks[0]?.label).toMatch(/^\d+ Alba/);
  });
});

describe('sortEvents', () => {
  it('ordina per data con il numero di giorno, non per testo', () => {
    const sorted = sortEvents(cal, [ev('tardi', 300), ev('presto', -50), ev('mezzo', 150)]);
    expect(sorted.map((s) => s.event.id)).toEqual(['presto', 'mezzo', 'tardi']);
    expect(sorted[0]?.startDay).toBeLessThan(sorted[1]?.startDay ?? 0);
  });
});
