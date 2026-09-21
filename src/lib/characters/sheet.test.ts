import { describe, expect, it } from 'vitest';
import { STATS_PRESETS } from '@/lib/stats/presets';
import { validateStatsValue } from '@/lib/stats/schema';
import { fieldName, parseSheetForm, readSheet } from './sheet';

const valid = (id: 'd20' | 'narrative' = 'd20') => {
  const r = validateStatsValue(STATS_PRESETS.find((p) => p.id === id)!.schema);
  if (!r.ok) throw new Error('preset non valido');
  return r;
};
const form = (fields: Record<string, string>) => (name: string) => fields[name];

describe('parseSheetForm', () => {
  it('i campi vuoti prendono il predefinito e le risorse il massimo', () => {
    const r = parseSheetForm(valid(), form({ [fieldName.attribute('str')]: '' }));
    expect(r.ok && r.sheet.attributes.str).toBe(10);
    expect(r.ok && r.sheet.resources.hp).toBe(10);
  });

  it('legge attributi, risorse, liste e testi', () => {
    const r = parseSheetForm(
      valid(),
      form({
        [fieldName.attribute('level')]: '5',
        [fieldName.attribute('con')]: '14',
        [fieldName.resource('hp')]: '20',
        [fieldName.cell('inventory', 0, 'name')]: 'Spada',
        [fieldName.cell('inventory', 0, 'qty')]: '1',
        [fieldName.cell('inventory', 0, 'weight')]: '1.5',
        [fieldName.cell('inventory', 1, 'name')]: '',
        [fieldName.cell('inventory', 1, 'qty')]: '',
        [fieldName.cell('inventory', 1, 'weight')]: '',
        [fieldName.text('background')]: '  Nato a Nord.  ',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheet.attributes).toMatchObject({ level: 5, con: 14 });
    expect(r.sheet.resources.hp).toBe(20);
    expect(r.sheet.lists.inventory).toEqual([{ name: 'Spada', qty: 1, weight: 1.5 }]);
    expect(r.sheet.text.background).toBe('Nato a Nord.');
  });

  it('rifiuta numeri non validi, fuori intervallo e non interi', () => {
    const errs = (fields: Record<string, string>) => {
      const r = parseSheetForm(valid(), form(fields));
      return r.ok ? [] : r.errors.map((e) => `${e.field}:${e.code}`);
    };
    expect(errs({ [fieldName.attribute('str')]: 'forte' })).toEqual(['str:not_a_number']);
    expect(errs({ [fieldName.attribute('str')]: '31' })).toEqual(['str:out_of_range']);
    expect(errs({ [fieldName.attribute('str')]: '10.5' })).toEqual(['str:not_integer']);
    expect(errs({ [fieldName.attribute('str')]: '1e3' })).toEqual(['str:not_a_number']);
  });

  it('una risorsa non supera il massimo calcolato con gli attributi inseriti', () => {
    const r = parseSheetForm(
      valid(),
      form({ [fieldName.attribute('con')]: '10', [fieldName.resource('hp')]: '11' }),
    );
    expect(r).toEqual({ ok: false, errors: [{ field: 'hp', code: 'out_of_range' }] });
    const ok = parseSheetForm(
      valid(),
      form({ [fieldName.attribute('con')]: '18', [fieldName.resource('hp')]: '11' }),
    );
    expect(ok.ok).toBe(true);
    expect(parseSheetForm(valid(), form({ [fieldName.resource('hp')]: '-1' })).ok).toBe(false);
  });

  it('celle e testi troppo lunghi, righe di lista in eccesso', () => {
    const long = parseSheetForm(
      valid(),
      form({ [fieldName.cell('skills', 0, 'name')]: 'x'.repeat(201) }),
    );
    expect(long).toEqual({ ok: false, errors: [{ field: 'skills', code: 'too_long' }] });
    const text = parseSheetForm(
      valid(),
      form({ [fieldName.text('background')]: 'x'.repeat(20001) }),
    );
    expect(text.ok).toBe(false);
    const rows: Record<string, string> = {};
    for (let i = 0; i < 105; i++) rows[fieldName.cell('skills', i, 'name')] = `a${i}`;
    const many = parseSheetForm(valid(), form(rows));
    expect(many).toEqual({ ok: false, errors: [{ field: 'skills', code: 'too_many_rows' }] });
  });

  it('chiavi non previste dallo schema sono ignorate', () => {
    const r = parseSheetForm(valid(), form({ 'attr:dragon': '99', 'text:altro': 'x' }));
    expect(r.ok && Object.keys(r.sheet.attributes)).not.toContain('dragon');
  });
});

describe('readSheet', () => {
  it('tiene solo ciò che lo schema prevede e ha il tipo giusto', () => {
    const s = readSheet(
      {
        attributes: { str: 12, dragon: 9, dex: 'alto', con: Infinity },
        resources: { hp: 7 },
        lists: { inventory: [{ name: 'Corda', qty: 2, extra: 1 }, 'x', { name: {} }], nope: [] },
        text: { background: 'ok', bio: 3 },
      },
      valid(),
    );
    expect(s.attributes).toEqual({ str: 12 });
    expect(s.resources).toEqual({ hp: 7 });
    expect(s.lists.inventory).toEqual([{ name: 'Corda', qty: 2 }, {}]);
    expect(s.text).toEqual({ background: 'ok' });
  });

  it('un valore che non è un oggetto dà una scheda vuota', () => {
    for (const raw of [null, 5, 'x', [1]]) {
      expect(readSheet(raw, valid())).toEqual({
        attributes: {},
        resources: {},
        lists: {},
        text: {},
      });
    }
  });
});
