import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE,
  MAX_ZOOM,
  parseTimelineConfig,
  parseTimelineParams,
  timelineQuery,
} from './params';

const id = '11111111-1111-4111-8111-111111111111';

describe('parseTimelineParams', () => {
  it('senza parametri dà i valori predefiniti', () => {
    expect(parseTimelineParams({})).toEqual(DEFAULT_TIMELINE);
  });

  it('legge calendario, campi, corsie, filtri, zoom e centro', () => {
    const p = parseTimelineParams({
      calendar: id,
      start: 'nascita',
      end: 'morte',
      lane: 'tag',
      category: id,
      tag: ' guerra ',
      related: 'Elara   Venti',
      zoom: '3',
      center: '-1200',
    });
    expect(p).toEqual({
      calendar: id,
      start: 'nascita',
      end: 'morte',
      lane: 'tag',
      category: id,
      tag: 'guerra',
      related: 'Elara Venti',
      zoom: 3,
      center: -1200,
    });
  });

  it('ignora i valori ostili invece di fallire', () => {
    const p = parseTimelineParams({
      calendar: 'xx',
      start: 'Maiuscolo!',
      end: '9x',
      lane: 'boh',
      category: 'zz',
      zoom: '99',
      center: '1e9999',
    });
    expect(p).toEqual({ ...DEFAULT_TIMELINE, zoom: MAX_ZOOM });
    expect(parseTimelineParams({ zoom: '99' }).zoom).toBe(MAX_ZOOM);
    expect(parseTimelineParams({ zoom: '-2' }).zoom).toBe(0);
    expect(parseTimelineParams({ related: 'a'.repeat(500) }).related).toHaveLength(120);
  });

  it('con parametri ripetuti usa il primo', () => {
    expect(parseTimelineParams({ zoom: ['2', '5'] }).zoom).toBe(2);
  });
});

describe('timelineQuery', () => {
  it('scrive solo ciò che non è predefinito e si rilegge uguale', () => {
    expect(timelineQuery(DEFAULT_TIMELINE)).toBe('');
    const p = parseTimelineParams({ lane: 'tag', zoom: '2', center: '40', start: 'nascita' });
    const qs = timelineQuery(p);
    expect(qs).toBe('start=nascita&lane=tag&zoom=2&center=40');
    expect(parseTimelineParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(p);
  });
});

describe('parseTimelineConfig', () => {
  it('accetta la configurazione salvata con gli stessi limiti', () => {
    const p = parseTimelineConfig({
      lane: 'tag',
      zoom: 2,
      center: 15.7,
      start: 'nascita',
      calendar: id,
    });
    expect(p).toMatchObject({ lane: 'tag', zoom: 2, center: 15, start: 'nascita', calendar: id });
    expect(parseTimelineConfig(null)).toEqual(DEFAULT_TIMELINE);
    expect(parseTimelineConfig({ zoom: 'x', center: {}, start: 5 })).toEqual(DEFAULT_TIMELINE);
  });
});
