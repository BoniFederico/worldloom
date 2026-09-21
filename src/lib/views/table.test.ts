import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE_CONFIG,
  cellText,
  configFromQuery,
  configQuery,
  groupRows,
  parseTableConfig,
  sortRows,
  type TableContext,
  type TableRow,
} from './table';

const ctx: TableContext = {
  categories: new Map([
    ['c1', 'Personaggio'],
    ['c2', 'Luogo'],
  ]),
  fields: new Map([
    ['eta', { label: 'Età', type: 'number' }],
    ['nato', { label: 'Nato il', type: 'date' }],
    ['ruolo', { label: 'Ruolo', type: 'choice' }],
  ]),
};

const row = (over: Partial<TableRow> & { id: string; title: string }): TableRow => ({
  status: 'draft',
  tags: [],
  updated_at: '2026-01-01T00:00:00Z',
  category_ids: [],
  fields: {},
  ...over,
});

const rows: TableRow[] = [
  row({
    id: 'a',
    title: 'Borin',
    status: 'final',
    category_ids: ['c1'],
    fields: { eta: 100, ruolo: 'Alleato' },
  }),
  row({
    id: 'b',
    title: 'Aldera',
    category_ids: ['c1', 'c2'],
    fields: { eta: 9, ruolo: 'Alleato' },
  }),
  row({ id: 'c', title: 'Cael', status: 'final', fields: { eta: 20 } }),
  row({ id: 'd', title: 'Dorna', category_ids: ['c2'], fields: {} }),
];

describe('parseTableConfig', () => {
  it('senza configurazione usa i valori predefiniti', () => {
    expect(parseTableConfig(undefined)).toEqual(DEFAULT_TABLE_CONFIG);
    expect(parseTableConfig({})).toEqual(DEFAULT_TABLE_CONFIG);
    expect(DEFAULT_TABLE_CONFIG.columns[0]).toBe('title');
  });

  it('scarta colonne, ordinamenti e raggruppamenti non validi', () => {
    const c = parseTableConfig({
      columns: ['title', 'evil', 'field:BAD KEY', 'field:eta', 'title', 42],
      sort: { by: 'drop table', dir: 'sideways' },
      group: 'field:eta; --',
    });
    expect(c.columns).toEqual(['title', 'field:eta']);
    expect(c.sort).toEqual(DEFAULT_TABLE_CONFIG.sort);
    expect(c.group).toBeNull();
  });

  it('limita il numero di colonne e tiene sempre il titolo', () => {
    const many = Array.from({ length: 40 }, (_, i) => `field:k${i}`);
    const c = parseTableConfig({ columns: many });
    expect(c.columns.length).toBeLessThanOrEqual(12);
    expect(c.columns[0]).toBe('title');
  });

  it('non esplode con input ostili', () => {
    for (const input of [null, 'x', [], 7, { columns: 'title' }, { sort: null }]) {
      expect(() => parseTableConfig(input)).not.toThrow();
    }
  });
});

describe('configQuery / configFromQuery', () => {
  it('round trip', () => {
    const c = parseTableConfig({
      columns: ['title', 'status', 'field:eta'],
      sort: { by: 'field:eta', dir: 'desc' },
      group: 'status',
    });
    expect(configFromQuery(Object.fromEntries(new URLSearchParams(configQuery(c))))).toEqual(c);
  });
});

describe('configFromQuery con colonne ripetute (form senza JavaScript)', () => {
  it('unisce i parametri cols ripetuti', () => {
    const c = configFromQuery({
      cols: ['title', 'status', 'field:eta'],
      sort: 'title',
      dir: 'asc',
    });
    expect(c.columns).toEqual(['title', 'status', 'field:eta']);
  });
});

describe('cellText', () => {
  it('formatta i valori delle colonne', () => {
    const r = row({
      id: 'x',
      title: 'Elara',
      status: 'final',
      tags: ['eroe', 'nord'],
      category_ids: ['c1', 'c2'],
      fields: { eta: 34, ruolo: 'Alleato' },
    });
    expect(cellText(r, 'title', ctx)).toBe('Elara');
    expect(cellText(r, 'tags', ctx)).toBe('eroe, nord');
    expect(cellText(r, 'categories', ctx)).toBe('Personaggio, Luogo');
    expect(cellText(r, 'field:eta', ctx)).toBe('34');
    expect(cellText(r, 'field:nato', ctx)).toBe('');
  });

  it('rende leggibili i valori strutturati', () => {
    const r = row({
      id: 'x',
      title: 'E',
      fields: { data: { calendar: 'c', year: 12, month: 3, day: 4 } },
    });
    expect(cellText(r, 'field:data', ctx)).toBe('4/3/12');
  });
});

describe('sortRows', () => {
  const ids = (rs: TableRow[]) => rs.map((r) => r.id);

  it('ordina per titolo senza badare a maiuscole', () => {
    expect(ids(sortRows(rows, { by: 'title', dir: 'asc' }, ctx))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(sortRows(rows, { by: 'title', dir: 'desc' }, ctx))).toEqual(['d', 'c', 'a', 'b']);
  });

  it('ordina i numeri come numeri, non come testo, con i vuoti sempre in fondo', () => {
    expect(ids(sortRows(rows, { by: 'field:eta', dir: 'asc' }, ctx))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(sortRows(rows, { by: 'field:eta', dir: 'desc' }, ctx))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('non modifica l’array di partenza', () => {
    const copy = [...rows];
    sortRows(rows, { by: 'title', dir: 'desc' }, ctx);
    expect(rows).toEqual(copy);
  });

  it('a parità di valore ordina per titolo (risultato stabile)', () => {
    expect(ids(sortRows(rows, { by: 'status', dir: 'asc' }, ctx))).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('groupRows', () => {
  it('senza raggruppamento restituisce un solo gruppo', () => {
    const g = groupRows(rows, null, ctx);
    expect(g).toHaveLength(1);
    expect(g[0]?.rows).toHaveLength(4);
  });

  it('raggruppa per stato', () => {
    const g = groupRows(rows, 'status', ctx);
    expect(g.map((x) => [x.key, x.rows.length])).toEqual([
      ['draft', 2],
      ['final', 2],
    ]);
  });

  it('per categoria uno snippet compare in ogni sua categoria; senza categoria in un gruppo a parte in fondo', () => {
    const g = groupRows(rows, 'category', ctx);
    expect(g.map((x) => [x.label, x.rows.map((r) => r.id)])).toEqual([
      ['Luogo', ['b', 'd']],
      ['Personaggio', ['a', 'b']],
      ['', ['c']],
    ]);
  });

  it('per campo: gruppi ordinati, valori mancanti in fondo', () => {
    const g = groupRows(rows, 'field:ruolo', ctx);
    expect(g.map((x) => x.label)).toEqual(['Alleato', '']);
  });
});

describe('date del calendario', () => {
  const dated = [
    row({ id: 'x', title: 'X', fields: { data: { calendar: 'c', year: 2026, month: 3, day: 9 } } }),
    row({
      id: 'y',
      title: 'Y',
      fields: { data: { calendar: 'c', year: 2026, month: 1, day: 20 } },
    }),
    row({ id: 'z', title: 'Z', fields: { data: { calendar: 'c', year: 2020, month: 1, day: 2 } } }),
    row({
      id: 'w',
      title: 'W',
      fields: { data: { calendar: 'c', year: 2025, month: 12, day: 1 } },
    }),
  ];
  const ids = (rs: TableRow[]) => rs.map((r) => r.id);

  it('si ordinano in ordine cronologico, non per giorno', () => {
    expect(ids(sortRows(dated, { by: 'field:data', dir: 'asc' }, ctx))).toEqual([
      'z',
      'w',
      'y',
      'x',
    ]);
    expect(ids(sortRows(dated, { by: 'field:data', dir: 'desc' }, ctx))).toEqual([
      'x',
      'y',
      'w',
      'z',
    ]);
  });

  it('anche i gruppi per campo data sono in ordine cronologico', () => {
    const g = groupRows(dated, 'field:data', ctx);
    expect(g.map((x) => x.rows[0]?.id)).toEqual(['z', 'w', 'y', 'x']);
  });
});
