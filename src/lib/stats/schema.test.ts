import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { checkAttributeValues, computeSheet } from './compute';
import { parseJsonWithPositions } from './json-locate';
import { STATS_PRESETS } from './presets';
import { validateStatsText, validateStatsValue, type StatsError } from './schema';
import jsonSchema from './stats.schema.json';

const doc = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  name: 'Prova',
  attributes: [{ key: 'str', label: 'Forza', type: 'integer', min: 1, max: 30, default: 10 }],
  derived: [{ key: 'str_mod', label: 'Mod', formula: 'floor((str - 10) / 2)' }],
  resources: [{ key: 'hp', label: 'PF', type: 'pool', maxFormula: '10 + str_mod' }],
  ...over,
});

const errorsOf = (value: unknown): StatsError[] => {
  const r = validateStatsValue(value);
  return r.ok ? [] : r.errors;
};
const codes = (value: unknown) => errorsOf(value).map((e) => `${e.code}@${e.path}`);

describe('posizioni nel JSON', () => {
  it('riporta riga e colonna dei valori e delle chiavi', () => {
    const r = parseJsonWithPositions('{\n  "a": [1,\n    {"b": true}],\n  "c": "x"\n}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at('a[1].b')).toEqual({ line: 3, column: 11 });
    expect(r.at('a[1].b#key')).toEqual({ line: 3, column: 6 });
    expect(r.at('c')).toEqual({ line: 4, column: 8 });
  });

  it('segnala la sintassi errata con la posizione', () => {
    const r = parseJsonWithPositions('{\n  "a": 1,\n  "b": }\n');
    expect(r).toEqual({ ok: false, error: { line: 3, column: 8 } });
    expect(parseJsonWithPositions('{"a": 1} x').ok).toBe(false);
    expect(parseJsonWithPositions('{"a": 01}').ok).toBe(false);
    expect(parseJsonWithPositions('[1,]').ok).toBe(false);
  });

  it('una chiave __proto__ non tocca il prototipo', () => {
    const r = parseJsonWithPositions('{"__proto__": {"polluted": true}}');
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rifiuta annidamenti eccessivi', () => {
    expect(parseJsonWithPositions('['.repeat(200) + ']'.repeat(200)).ok).toBe(false);
  });
});

describe('validazione dello schema', () => {
  it('accetta uno schema valido e ordina i derivati per dipendenza', () => {
    const r = validateStatsValue(
      doc({
        derived: [
          { key: 'b', label: 'B', formula: 'a + 1' },
          { key: 'a', label: 'A', formula: 'str * 2' },
        ],
        resources: [],
      }),
    );
    expect(r.ok && r.derivedOrder).toEqual(['a', 'b']);
  });

  it('applica i predefiniti alle sezioni mancanti', () => {
    const r = validateStatsValue({ schemaVersion: 1, name: 'Vuoto' });
    expect(r.ok && r.schema.attributes).toEqual([]);
  });

  it('campi obbligatori, tipi e campi sconosciuti', () => {
    expect(codes({ schemaVersion: 1 })).toEqual(['required@name']);
    expect(codes(doc({ name: 5 }))).toEqual(['invalid_type@name']);
    expect(codes(doc({ extra: 1 }))).toEqual(['unknown_field@extra']);
    expect(codes(doc({ schemaVersion: 2 }))).toEqual(['unsupported_version@schemaVersion']);
    expect(codes(doc({ attributes: [{ key: 'Str', label: 'x', type: 'integer' }] }))).toEqual([
      'invalid_key@attributes[0].key',
    ]);
    expect(
      codes(
        doc({
          attributes: [{ key: 'a', label: 'x', type: 'boolean' }],
          derived: [],
          resources: [],
        }),
      ),
    ).toEqual(['invalid_value@attributes[0].type']);
    expect(codes('testo')).toEqual(['invalid_type@']);
  });

  it('chiavi doppie, riservate e in conflitto con il massimo di una risorsa', () => {
    expect(
      codes(doc({ derived: [{ key: 'str', label: 'x', formula: '1' }], resources: [] })),
    ).toEqual(['duplicate_key@derived[0].key']);
    expect(
      codes(doc({ derived: [{ key: 'floor', label: 'x', formula: '1' }], resources: [] })),
    ).toEqual(['reserved_key@derived[0].key']);
    expect(
      codes(
        doc({
          derived: [{ key: 'hp_max', label: 'x', formula: '1' }],
          resources: [{ key: 'hp', label: 'PF', type: 'pool', max: 5 }],
        }),
      ),
    ).toEqual(['duplicate_key@resources[0].key']);
  });

  it('intervalli degli attributi', () => {
    const attrs = (a: Record<string, unknown>) =>
      doc({
        attributes: [{ key: 'str', label: 'F', type: 'integer', ...a }],
        derived: [],
        resources: [],
      });
    expect(codes(attrs({ min: 5, max: 1 }))).toEqual(['invalid_range@attributes[0].min']);
    expect(codes(attrs({ min: 1, max: 5, default: 9 }))).toEqual([
      'invalid_range@attributes[0].default',
    ]);
    expect(codes(attrs({ default: 1.5 }))).toEqual(['invalid_range@attributes[0].default']);
  });

  it('formule: sintassi, riferimenti, cicli', () => {
    const e = errorsOf(doc({ derived: [{ key: 'x', label: 'X', formula: '1 +' }], resources: [] }));
    expect(e[0]).toMatchObject({
      code: 'formula',
      path: 'derived[0].formula',
      detail: 'unexpected_end',
    });
    const u = errorsOf(
      doc({ derived: [{ key: 'x', label: 'X', formula: 'str + missing' }], resources: [] }),
    );
    expect(u[0]).toMatchObject({ code: 'unknown_reference', detail: 'missing', index: 6 });
    // Una risorsa non è visibile alle formule (solo attributi e derivati).
    expect(
      codes(
        doc({
          derived: [{ key: 'x', label: 'X', formula: 'hp' }],
          resources: [{ key: 'hp', label: 'H', type: 'pool', max: 5 }],
        }),
      ),
    ).toEqual(['unknown_reference@derived[0].formula']);
    const cycle = doc({
      derived: [
        { key: 'a', label: 'A', formula: 'b + 1' },
        { key: 'b', label: 'B', formula: 'a + 1' },
      ],
      resources: [],
    });
    expect(codes(cycle)).toEqual(['formula_cycle@derived[0].formula']);
    expect(
      codes(doc({ derived: [{ key: 'a', label: 'A', formula: 'a' }], resources: [] })),
    ).toEqual(['formula_cycle@derived[0].formula']);
  });

  it('risorse: massimo fisso o formula, non entrambi né nessuno', () => {
    const r = (o: Record<string, unknown>) =>
      doc({ derived: [], resources: [{ key: 'hp', label: 'PF', type: 'pool', ...o }] });
    expect(codes(r({}))).toEqual(['max_required@resources[0]']);
    expect(codes(r({ max: 5, maxFormula: '5' }))).toEqual(['max_conflict@resources[0]']);
    expect(codes(r({ max: -1 }))).toEqual(['invalid_range@resources[0].max']);
    expect(codes(r({ max: 5 }))).toEqual([]);
  });

  it('layout: solo campi esistenti', () => {
    expect(codes(doc({ layout: [{ section: 'S', fields: ['str', 'nope', 'hp_max'] }] }))).toEqual([
      'unknown_reference@layout[0].fields[1]',
      'unknown_reference@layout[0].fields[2]',
    ]);
  });

  it('un numero eccessivo di campi è rifiutato', () => {
    const many = Array.from({ length: 201 }, (_, n) => ({
      key: `a${n}`,
      label: 'x',
      type: 'integer',
    }));
    expect(codes(doc({ attributes: many, derived: [], resources: [] }))).toEqual([
      'too_many_fields@attributes',
    ]);
  });
});

describe('errori dal testo: riga, colonna e campo', () => {
  const text = `{
  "schemaVersion": 1,
  "name": "Prova",
  "attributes": [
    { "key": "str", "label": "Forza", "type": "integer" }
  ],
  "derived": [
    { "key": "mod", "label": "Mod", "formula": "str +" }
  ]
}`;

  it('punta alla riga del campo con l’errore', () => {
    const r = validateStatsText(text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({
      code: 'formula',
      path: 'derived[0].formula',
      field: 'formula',
      line: 8,
      detail: 'unexpected_end',
    });
  });

  it('un campo mancante punta all’oggetto che lo contiene', () => {
    const r = validateStatsText('{\n  "schemaVersion": 1\n}');
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors[0]).toMatchObject({
        code: 'required',
        path: 'name',
        field: 'name',
        line: 1,
        column: 1,
      });
  });

  it('un campo sconosciuto punta alla chiave', () => {
    const r = validateStatsText('{\n  "schemaVersion": 1,\n  "name": "x",\n  "colore": 1\n}');
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors[0]).toMatchObject({
        code: 'unknown_field',
        field: 'colore',
        line: 4,
        column: 3,
      });
  });

  it('JSON non valido e documento troppo grande', () => {
    const bad = validateStatsText('{"a": ');
    expect(!bad.ok && bad.errors[0]).toMatchObject({ code: 'json_syntax', line: 1 });
    const big = validateStatsText(' '.repeat(200_001));
    expect(!big.ok && big.errors[0]?.code).toBe('too_large');
  });
});

describe('calcolo della scheda', () => {
  const valid = () => {
    const r = validateStatsValue(doc());
    if (!r.ok) throw new Error('schema di prova non valido');
    return r;
  };

  it('usa il predefinito e calcola derivati e massimi', () => {
    const s = computeSheet(valid());
    expect(s.attributes).toEqual({ str: 10 });
    expect(s.derived).toEqual({ str_mod: 0 });
    expect(s.max).toEqual({ hp: 10 });
  });

  it('usa i valori dati e ignora quelli non numerici', () => {
    expect(computeSheet(valid(), { str: 17 }).max).toEqual({ hp: 13 });
    expect(computeSheet(valid(), { str: 'tanta' }).derived).toEqual({ str_mod: 0 });
    expect(computeSheet(valid(), { str: Infinity }).derived).toEqual({ str_mod: 0 });
  });

  it('un errore di formula dà null e non ferma le altre voci', () => {
    const r = validateStatsValue(
      doc({
        derived: [
          { key: 'bad', label: 'B', formula: '1 / (str - 10)' },
          { key: 'good', label: 'G', formula: 'str + 1' },
        ],
        resources: [],
      }),
    );
    if (!r.ok) throw new Error('non valido');
    const s = computeSheet(r);
    expect(s.derived).toEqual({ bad: null, good: 11 });
    expect(s.errors).toEqual([
      { key: 'bad', error: expect.objectContaining({ code: 'division_by_zero' }) },
    ]);
  });

  it('i valori degli attributi si controllano per tipo e intervallo', () => {
    const { schema } = valid();
    expect(checkAttributeValues(schema, { str: 12 })).toEqual([]);
    expect(checkAttributeValues(schema, { str: 31 })).toEqual([
      { key: 'str', code: 'out_of_range' },
    ]);
    expect(checkAttributeValues(schema, { str: 1.5 })).toEqual([
      { key: 'str', code: 'not_integer' },
    ]);
    expect(checkAttributeValues(schema, { str: '3' })).toEqual([
      { key: 'str', code: 'not_a_number' },
    ]);
    expect(checkAttributeValues(schema, { altro: 1 })).toEqual([]);
  });
});

describe('preset', () => {
  it('sono quattro e ognuno è valido e calcola senza errori', () => {
    expect(STATS_PRESETS.map((p) => p.id)).toEqual(['d20', 'percentile', 'dice-pool', 'narrative']);
    for (const p of STATS_PRESETS) {
      const r = validateStatsValue(p.schema);
      expect(r.ok, `${p.id}: ${JSON.stringify(!r.ok && r.errors)}`).toBe(true);
      if (!r.ok) continue;
      const sheet = computeSheet(r);
      expect(sheet.errors, p.id).toEqual([]);
      expect(
        Object.values(sheet.max).every((m) => m !== null),
        p.id,
      ).toBe(true);
    }
  });

  it('il d20 dà i valori attesi per un personaggio di livello 5 con Cost. 14', () => {
    const preset = STATS_PRESETS.find((p) => p.id === 'd20')!;
    const r = validateStatsValue(preset.schema);
    if (!r.ok) throw new Error('non valido');
    const s = computeSheet(r, { level: 5, con: 14, dex: 16 });
    expect(s.derived).toMatchObject({ con_mod: 2, dex_mod: 3, prof: 3, ac: 13 });
    expect(s.max.hp).toBe(10 + 2 + 4 * (6 + 2));
  });

  it('sono documenti JSON: restituiscono lo stesso schema dopo un giro nel testo', () => {
    for (const p of STATS_PRESETS) {
      const r = validateStatsText(JSON.stringify(p.schema, null, 2));
      expect(r.ok && r.schema).toEqual(p.schema);
    }
  });
});

describe('JSON Schema', () => {
  const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: true });
  const validate = ajv.compile(jsonSchema);

  it('accetta tutti i preset', () => {
    for (const p of STATS_PRESETS) expect(validate(p.schema), p.id).toBe(true);
  });

  it('rifiuta gli stessi errori strutturali del validatore', () => {
    expect(validate({ schemaVersion: 1 })).toBe(false);
    expect(validate(doc({ extra: 1 }))).toBe(false);
    expect(validate(doc({ attributes: [{ key: 'Str', label: 'x', type: 'integer' }] }))).toBe(
      false,
    );
    expect(validate(doc({ resources: [{ key: 'hp', label: 'x', type: 'pool' }] }))).toBe(false);
    expect(
      validate(
        doc({ resources: [{ key: 'hp', label: 'x', type: 'pool', max: 1, maxFormula: '1' }] }),
      ),
    ).toBe(false);
    expect(validate(doc({ schemaVersion: 2 }))).toBe(false);
  });
});
