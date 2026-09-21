import { describe, expect, it } from 'vitest';
import { STATS_PRESETS } from './presets';
import { describeMigration, diffSchemas, planMigration, type SheetRow } from './migrate';
import { validateStatsValue, type StatsSchema } from './schema';
import type { ValidSchema } from './compute';

const build = (over: Record<string, unknown> = {}): ValidSchema => {
  const r = validateStatsValue({
    schemaVersion: 1,
    name: 'Prova',
    attributes: [
      { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30, default: 10 },
      { key: 'wis', label: 'Saggezza', type: 'integer', min: 1, max: 30, default: 10 },
    ],
    derived: [{ key: 'str_mod', label: 'Mod', formula: 'floor((str - 10) / 2)' }],
    resources: [{ key: 'hp', label: 'PF', type: 'pool', maxFormula: '10 + str_mod' }],
    lists: [{ key: 'inv', label: 'Inventario', item: { name: 'text', qty: 'integer' } }],
    text: [{ key: 'bio', label: 'Bio' }],
    ...over,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { schema: r.schema, derivedOrder: r.derivedOrder };
};

const sheet = (id: string, over: Record<string, unknown> = {}): SheetRow => ({
  id,
  rev: 1,
  sheet: {
    attributes: { str: 14, wis: 12 },
    resources: { hp: 12 },
    lists: { inv: [{ name: 'Corda', qty: 2 }] },
    text: { bio: 'Nata a Nord.' },
    ...over,
  },
});

describe('diffSchemas', () => {
  it('elenca le chiavi tolte e aggiunte per sezione', () => {
    const next = build({
      attributes: [
        { key: 'str', label: 'Forza', type: 'integer' },
        { key: 'sag', label: 'Saggezza', type: 'integer' },
      ],
      text: [],
    });
    expect(diffSchemas(build().schema, next.schema)).toEqual({
      removed: ['attributes.wis', 'text.bio'],
      added: ['attributes.sag'],
    });
  });

  it('due schemi uguali non hanno differenze', () => {
    expect(diffSchemas(build().schema, build().schema)).toEqual({ removed: [], added: [] });
  });
});

describe('planMigration', () => {
  const next = (over: Record<string, unknown>) => build(over);

  it('senza cambiamenti nessuna scheda va riscritta', () => {
    const plan = planMigration(build(), build(), [sheet('a')], {});
    expect(plan).toMatchObject({ ok: true, sheets: [], removed: [], clamped: 0 });
  });

  it('conta i valori che si perderebbero, per chiave e per numero di schede', () => {
    const n = next({
      attributes: [{ key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30 }],
      text: [],
    });
    const plan = planMigration(
      build(),
      n,
      [sheet('a'), sheet('b', { attributes: { str: 9 } })],
      {},
    );
    expect(plan.ok && plan.removed).toEqual([
      { ref: 'attributes.wis', section: 'attributes', key: 'wis', sheets: 1 },
      { ref: 'text.bio', section: 'text', key: 'bio', sheets: 2 },
    ]);
    // Senza spostamenti i valori si eliminano.
    expect(plan.ok && plan.sheets.find((s) => s.id === 'a')?.sheet).toEqual({
      attributes: { str: 14 },
      resources: { hp: 12 },
      lists: { inv: [{ name: 'Corda', qty: 2 }] },
      text: {},
    });
  });

  it('sposta un valore su una chiave nuova della stessa sezione', () => {
    const n = next({
      attributes: [
        { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30 },
        { key: 'sag', label: 'Saggezza', type: 'integer', min: 1, max: 30 },
      ],
    });
    const plan = planMigration(build(), n, [sheet('a')], { 'attributes.wis': 'sag' });
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({ attributes: { str: 14, sag: 12 } });
    expect(plan.ok && plan.moved).toBe(1);
  });

  it('rifiuta spostamenti su chiavi non nuove, di un’altra sezione o doppie', () => {
    const n = next({
      attributes: [
        { key: 'str', label: 'Forza', type: 'integer' },
        { key: 'a', label: 'A', type: 'integer' },
        { key: 'b', label: 'B', type: 'integer' },
      ],
      text: [],
    });
    const run = (moves: Record<string, string | null>) => {
      const p = planMigration(build(), n, [sheet('a')], moves);
      return p.ok ? 'ok' : p.error;
    };
    expect(run({ 'attributes.wis': 'str' })).toBe('invalid_move');
    expect(run({ 'attributes.wis': 'nope' })).toBe('invalid_move');
    expect(run({ 'attributes.str': 'a' })).toBe('invalid_move');
    expect(run({ 'text.bio': 'a' })).toBe('invalid_move');
    expect(run({ 'attributes.wis': 'a', 'text.bio': 'b' })).toBe('invalid_move');
    expect(run({ 'attributes.wis': 'a' })).toBe('ok');
  });

  it('due origini sulla stessa destinazione sono rifiutate', () => {
    const n = next({
      attributes: [
        { key: 'str', label: 'F', type: 'integer' },
        { key: 'x', label: 'X', type: 'integer' },
      ],
      resources: [],
      derived: [],
    });
    const old = build({
      attributes: [
        { key: 'str', label: 'F', type: 'integer' },
        { key: 'wis', label: 'S', type: 'integer' },
        { key: 'dex', label: 'D', type: 'integer' },
      ],
      derived: [],
      resources: [],
    });
    const p = planMigration(old, n, [sheet('a')], { 'attributes.wis': 'x', 'attributes.dex': 'x' });
    expect(p.ok).toBe(false);
  });

  it('riporta nei limiti i valori che escono dai nuovi intervalli e arrotonda gli interi', () => {
    const n = next({
      attributes: [
        { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 12 },
        { key: 'wis', label: 'Saggezza', type: 'integer', min: 1, max: 30 },
      ],
    });
    const plan = planMigration(
      build(),
      n,
      [sheet('a', { attributes: { str: 14, wis: 12.6 } })],
      {},
    );
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({ attributes: { str: 12, wis: 13 } });
    // Forza 14→12, Saggezza 12,6→13 e i PF 12→11 (il massimo scende con il modificatore).
    expect(plan.ok && plan.clamped).toBe(3);
  });

  it('una risorsa non supera il nuovo massimo', () => {
    const n = next({ resources: [{ key: 'hp', label: 'PF', type: 'pool', max: 5 }] });
    const plan = planMigration(build(), n, [sheet('a')], {});
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({ resources: { hp: 5 } });
    expect(plan.ok && plan.clamped).toBe(1);
  });

  it('le liste tengono le colonne che esistono ancora e convertono i tipi', () => {
    const n = next({
      lists: [
        { key: 'inv', label: 'Inventario', item: { name: 'text', qty: 'text', peso: 'number' } },
      ],
    });
    const plan = planMigration(build(), n, [sheet('a')], {});
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({
      lists: { inv: [{ name: 'Corda', qty: '2' }] },
    });
    const back = next({
      lists: [{ key: 'inv', label: 'Inventario', item: { name: 'text', qty: 'integer' } }],
    });
    const plan2 = planMigration(
      n,
      back,
      [
        sheet('a', {
          lists: {
            inv: [
              { name: 'X', qty: 'molti' },
              { name: 'Y', qty: '3' },
            ],
          },
        }),
      ],
      {},
    );
    expect(plan2.ok && plan2.sheets[0]?.sheet).toMatchObject({
      lists: { inv: [{ name: 'X' }, { name: 'Y', qty: 3 }] },
    });
  });

  it('sposta una lista su una lista nuova e un testo su un testo nuovo', () => {
    const n = next({
      lists: [{ key: 'gear', label: 'Dotazione', item: { name: 'text', qty: 'integer' } }],
      text: [{ key: 'story', label: 'Storia' }],
    });
    const plan = planMigration(build(), n, [sheet('a')], {
      'lists.inv': 'gear',
      'text.bio': 'story',
    });
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({
      lists: { gear: [{ name: 'Corda', qty: 2 }] },
      text: { story: 'Nata a Nord.' },
    });
  });

  it('ignora i valori che già oggi non stanno nello schema o hanno il tipo sbagliato', () => {
    const plan = planMigration(
      build(),
      build(),
      [{ id: 'a', rev: 1, sheet: { attributes: { str: 'forte', dragon: 3 }, lists: 5 } }],
      {},
    );
    expect(plan.ok && plan.sheets).toEqual([]);
  });

  it('passare da un preset a un altro non lancia e non lascia valori orfani', () => {
    const [d20, , dice] = STATS_PRESETS;
    const a = validateStatsValue(d20!.schema);
    const b = validateStatsValue(dice!.schema);
    if (!a.ok || !b.ok) throw new Error('preset non valido');
    const old: ValidSchema = { schema: a.schema as StatsSchema, derivedOrder: a.derivedOrder };
    const nxt: ValidSchema = { schema: b.schema as StatsSchema, derivedOrder: b.derivedOrder };
    const plan = planMigration(
      old,
      nxt,
      [{ id: 'a', rev: 3, sheet: { attributes: { str: 18 }, resources: { hp: 9 } } }],
      {},
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sheets[0]?.rev).toBe(3);
    expect(Object.keys((plan.sheets[0]!.sheet as { attributes: object }).attributes)).toEqual([]);
    expect(plan.removed.map((r) => r.ref)).toContain('attributes.str');
  });
});

describe('describeMigration', () => {
  it('propone la chiave nuova con la stessa etichetta e le altre come alternative', () => {
    const old = build();
    const next = build({
      attributes: [
        { key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30 },
        { key: 'sag', label: 'saggezza', type: 'integer', min: 1, max: 30 },
        { key: 'cha', label: 'Carisma', type: 'integer' },
      ],
    });
    const plan = planMigration(old, next, [sheet('a')], {});
    if (!plan.ok) throw new Error('piano non valido');
    const info = describeMigration(old.schema, next.schema, plan);
    expect(info.sheetsChanged).toBe(1);
    expect(info.items).toEqual([
      {
        ref: 'attributes.wis',
        label: 'Saggezza',
        sheets: 1,
        targets: [
          { key: 'sag', label: 'saggezza' },
          { key: 'cha', label: 'Carisma' },
        ],
        suggestion: 'sag',
      },
    ]);
  });
});

describe('convertCell tramite planMigration', () => {
  it('un numero scritto con spazi in un testo diventa numero', () => {
    const from = build({
      lists: [{ key: 'inv', label: 'I', item: { name: 'text', qty: 'text' } }],
    });
    const to = build({
      lists: [{ key: 'inv', label: 'I', item: { name: 'text', qty: 'integer' } }],
    });
    const plan = planMigration(
      from,
      to,
      [sheet('a', { lists: { inv: [{ name: 'X', qty: ' 5 ' }] } })],
      {},
    );
    expect(plan.ok && plan.sheets[0]?.sheet).toMatchObject({
      lists: { inv: [{ name: 'X', qty: 5 }] },
    });
  });
});
