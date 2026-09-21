import { describe, expect, it } from 'vitest';
import { parseMapForm, parsePinForm, parseRouteForm, toPercent } from './input';

const id = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const form = (values: Record<string, string>) => (name: string) => values[name];

describe('parseMapForm', () => {
  it('nome obbligatorio (max 80) e luogo facoltativo', () => {
    expect(parseMapForm(form({ name: '  Regione   Nord ', place: id }))).toEqual({
      ok: true,
      value: { name: 'Regione Nord', place: id },
    });
    expect(parseMapForm(form({ name: 'Città' }))).toEqual({
      ok: true,
      value: { name: 'Città', place: null },
    });
    expect(parseMapForm(form({ name: '  ' }))).toEqual({ ok: false, error: 'invalid_name' });
    expect(parseMapForm(form({ name: 'a'.repeat(81) }))).toEqual({
      ok: false,
      error: 'invalid_name',
    });
    expect(parseMapForm(form({ name: 'X', place: 'boh' }))).toEqual({
      ok: false,
      error: 'invalid_place',
    });
  });
});

describe('parsePinForm', () => {
  it('legge le coordinate in percentuale e le porta a 0–1', () => {
    expect(parsePinForm(form({ snippet: id, x: '25', y: '75,5' }))).toEqual({
      ok: true,
      value: { snippet: id, x: 0.25, y: 0.755 },
    });
    expect(parsePinForm(form({ snippet: id, x: '0', y: '100' }))).toEqual({
      ok: true,
      value: { snippet: id, x: 0, y: 1 },
    });
  });

  it('rifiuta luogo mancante, coordinate vuote, fuori scala o non numeriche', () => {
    const bad = (v: Record<string, string>) => {
      const r = parsePinForm(form(v));
      return r.ok ? 'ok' : r.error;
    };
    expect(bad({ x: '1', y: '1' })).toBe('invalid_snippet');
    expect(bad({ snippet: 'x', x: '1', y: '1' })).toBe('invalid_snippet');
    expect(bad({ snippet: id, x: '', y: '1' })).toBe('invalid_coordinates');
    expect(bad({ snippet: id, x: '101', y: '1' })).toBe('invalid_coordinates');
    expect(bad({ snippet: id, x: '-1', y: '1' })).toBe('invalid_coordinates');
    expect(bad({ snippet: id, x: 'a', y: '1' })).toBe('invalid_coordinates');
    expect(bad({ snippet: id, x: '1e2', y: '1' })).toBe('invalid_coordinates');
    expect(bad({ snippet: id, x: 'NaN', y: '1' })).toBe('invalid_coordinates');
  });
});

describe('parseRouteForm', () => {
  it('nome e da 2 a 30 tappe, ignorando i campi vuoti e mantenendo l’ordine', () => {
    expect(parseRouteForm('Viaggio', [id2, '', id])).toEqual({
      ok: true,
      value: { name: 'Viaggio', stops: [id2, id] },
    });
  });

  it('errori: nome, poche tappe, tappe non valide, troppe tappe', () => {
    const err = (name: string, stops: string[]) => {
      const r = parseRouteForm(name, stops);
      return r.ok ? 'ok' : r.error;
    };
    expect(err(' ', [id, id2])).toBe('invalid_route_name');
    expect(err('V', [id])).toBe('invalid_stops');
    expect(err('V', [id, 'boh'])).toBe('invalid_stops');
    expect(
      err(
        'V',
        Array.from({ length: 31 }, () => id),
      ),
    ).toBe('invalid_stops');
    expect(
      err(
        'V',
        Array.from({ length: 30 }, () => id),
      ),
    ).toBe('ok');
  });
});

describe('toPercent', () => {
  it('mostra 0–1 come percentuale leggibile', () => {
    expect(toPercent(0.755)).toBe('75.5');
    expect(toPercent(0.25)).toBe('25');
    expect(toPercent(1)).toBe('100');
  });
});
