import { describe, expect, it } from 'vitest';
import { planCsvImport } from './csv-plan';

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('planCsvImport', () => {
  it('ogni riga diventa uno snippet con i campi dalle altre colonne', () => {
    const rows = [
      ['titolo', 'età', 'ruolo'],
      ['Elara', '30', 'maga'],
      ['Bruno', '45', 'fabbro'],
    ];
    const plan = planCsvImport('Aurelia', 'Personaggi', rows, ids());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.snippets).toHaveLength(2);
    expect(plan.snippets[0]?.title).toBe('Elara');
    expect(plan.snippets[0]?.fields).toEqual({ eta: '30', ruolo: 'maga' });
    expect(plan.categories[0]?.name).toBe('Personaggi');
    expect(plan.categories[0]?.fields_schema).toEqual([
      { key: 'eta', label: 'età', type: 'text' },
      { key: 'ruolo', label: 'ruolo', type: 'text' },
    ]);
  });

  it('riconosce la colonna del titolo per nome comune, non solo la prima', () => {
    const rows = [
      ['ruolo', 'nome'],
      ['maga', 'Elara'],
    ];
    const plan = planCsvImport('Aurelia', 'Personaggi', rows, ids());
    expect(plan.ok && plan.snippets[0]?.title).toBe('Elara');
    expect(plan.ok && plan.snippets[0]?.fields).toEqual({ ruolo: 'maga' });
  });

  it('salta le righe senza titolo', () => {
    const rows = [['titolo'], [''], ['Elara']];
    const plan = planCsvImport('Aurelia', 'Personaggi', rows, ids());
    expect(plan.ok && plan.snippets).toHaveLength(1);
  });

  it('intestazioni duplicate o vuote producono chiavi uniche', () => {
    const rows = [
      ['titolo', 'nota', 'nota', ''],
      ['A', 'x', 'y', 'z'],
    ];
    const plan = planCsvImport('Aurelia', 'Cat', rows, ids());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const schema = plan.categories[0]?.fields_schema as { key: string }[] | undefined;
    const keys = (schema ?? []).map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('solo intestazione senza righe è un errore', () => {
    expect(planCsvImport('Aurelia', 'Cat', [['titolo']], ids())).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it('nessuna riga con titolo è un errore', () => {
    const rows = [['titolo'], ['']];
    expect(planCsvImport('Aurelia', 'Cat', rows, ids())).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it('più di 60 colonne oltre al titolo è un errore (tetto di fieldsSchema)', () => {
    const headers = ['titolo', ...Array.from({ length: 61 }, (_, i) => `campo${i}`)];
    const rows = [headers, ['A', ...Array.from({ length: 61 }, () => 'x')]];
    expect(planCsvImport('Aurelia', 'Cat', rows, ids())).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it('esattamente 60 colonne oltre al titolo è ammesso', () => {
    const headers = ['titolo', ...Array.from({ length: 60 }, (_, i) => `campo${i}`)];
    const rows = [headers, ['A', ...Array.from({ length: 60 }, () => 'x')]];
    const plan = planCsvImport('Aurelia', 'Cat', rows, ids());
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.categories[0]?.fields_schema).toHaveLength(60);
  });
});
