import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from './fields';
import { addField, fieldFromInput, moveField, removeField, updateField } from './edit';

const text = (key: string, label = key): FieldDefinition => ({ key, label, type: 'text' });

describe('fieldFromInput', () => {
  it('costruisce un campo di testo con chiave dall’etichetta', () => {
    const r = fieldFromInput({ label: 'Età del personaggio', type: 'number', required: 'on' }, []);
    expect(r).toEqual({
      ok: true,
      field: {
        key: 'eta_del_personaggio',
        label: 'Età del personaggio',
        type: 'number',
        required: true,
      },
    });
  });

  it('evita le collisioni di chiave con i campi esistenti', () => {
    const r = fieldFromInput({ label: 'Nome', type: 'text' }, ['nome']);
    expect(r.ok && r.field.key).toBe('nome_2');
  });

  it('per una scelta legge le opzioni una per riga, ripulite e senza righe vuote', () => {
    const r = fieldFromInput(
      { label: 'Stato', type: 'choice', options: ' vivo \n\nmorto\r\n' },
      [],
    );
    expect(r.ok && r.field.options).toEqual(['vivo', 'morto']);
  });

  it('rifiuta scelte senza opzioni o con opzioni duplicate', () => {
    expect(fieldFromInput({ label: 'Stato', type: 'choice', options: '' }, []).ok).toBe(false);
    expect(fieldFromInput({ label: 'Stato', type: 'choice', options: 'a\na' }, []).ok).toBe(false);
  });

  it('per un numero legge min e max, ignorandoli per gli altri tipi', () => {
    const num = fieldFromInput({ label: 'Forza', type: 'number', min: '1', max: '30' }, []);
    expect(num.ok && [num.field.min, num.field.max]).toEqual([1, 30]);
    const txt = fieldFromInput({ label: 'Nota', type: 'text', min: '1', max: '30' }, []);
    expect(txt.ok && txt.field.min).toBeUndefined();
  });

  it.each([
    [{ label: '   ', type: 'text' }],
    [{ label: 'X', type: 'inventato' }],
    [{ label: 'X', type: 'number', min: 'abc' }],
    [{ label: 'X', type: 'number', min: '9', max: '3' }],
  ])('rifiuta input non valido %j', (input) => {
    expect(fieldFromInput(input, []).ok).toBe(false);
  });
});

describe('modifica della lista dei campi', () => {
  const base = [text('a'), text('b'), text('c')];

  it('addField accoda e rifiuta i duplicati e il superamento del limite', () => {
    expect(addField(base, text('d')).map((f) => f.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(() => addField(base, text('a'))).toThrow();
    const many = Array.from({ length: 60 }, (_, i) => text(`k${i}`));
    expect(() => addField(many, text('extra'))).toThrow();
  });

  it('updateField cambia etichetta e vincoli ma mai la chiave né il tipo', () => {
    const next = updateField(base, 'b', { label: 'Beta', required: true });
    expect(next[1]).toEqual({ key: 'b', label: 'Beta', type: 'text', required: true });
    expect(updateField(base, 'inesistente', { label: 'x' })).toEqual(base);
  });

  it('updateField rimuove required quando è false e valida il risultato', () => {
    const withReq = updateField(base, 'a', { required: true });
    expect(updateField(withReq, 'a', { required: false })[0]).toEqual(text('a'));
    const choice: FieldDefinition[] = [
      { key: 's', label: 'S', type: 'choice', options: ['x', 'y'] },
    ];
    expect(() => updateField(choice, 's', { options: [] })).toThrow();
  });

  it('removeField toglie il campo e non altera gli altri', () => {
    expect(removeField(base, 'b').map((f) => f.key)).toEqual(['a', 'c']);
    expect(removeField(base, 'zzz')).toEqual(base);
  });

  it('moveField scambia con il vicino e resta fermo ai bordi', () => {
    expect(moveField(base, 'b', 'up').map((f) => f.key)).toEqual(['b', 'a', 'c']);
    expect(moveField(base, 'b', 'down').map((f) => f.key)).toEqual(['a', 'c', 'b']);
    expect(moveField(base, 'a', 'up').map((f) => f.key)).toEqual(['a', 'b', 'c']);
    expect(moveField(base, 'c', 'down').map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('non modifica l’array di partenza', () => {
    const copy = structuredClone(base);
    moveField(base, 'a', 'down');
    removeField(base, 'a');
    updateField(base, 'a', { label: 'Z' });
    expect(base).toEqual(copy);
  });
});
