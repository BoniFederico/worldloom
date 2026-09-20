import { describe, expect, it } from 'vitest';
import { hasCriteria, parseSearchParams, rpcArgs, splitExcerpt } from './params';

const uuid = '123e4567-e89b-12d3-a456-426614174000';

describe('parseSearchParams', () => {
  it('senza parametri: nessun criterio', () => {
    const p = parseSearchParams({});
    expect(p).toEqual({
      q: '',
      category: null,
      tags: [],
      status: null,
      fieldKey: null,
      fieldValue: '',
      relation: null,
      archived: false,
    });
    expect(hasCriteria(p)).toBe(false);
  });

  it('normalizza testo, tag, stato, campo e relazione', () => {
    const p = parseSearchParams({
      q: '  drago   antico ',
      category: uuid,
      tags: 'Magia, Nord',
      status: 'final',
      field: 'razza',
      value: ' Elfo ',
      relation: ' padre  di ',
      archived: '1',
    });
    expect(p).toEqual({
      q: 'drago antico',
      category: uuid,
      tags: ['magia', 'nord'],
      status: 'final',
      fieldKey: 'razza',
      fieldValue: 'Elfo',
      relation: 'padre di',
      archived: true,
    });
    expect(hasCriteria(p)).toBe(true);
  });

  it('un parametro ripetuto vale come il primo', () => {
    expect(parseSearchParams({ q: ['a', 'b'], status: ['draft', 'final'] })).toMatchObject({
      q: 'a',
      status: 'draft',
    });
  });

  it('scarta i valori non validi invece di dare errore', () => {
    const p = parseSearchParams({
      category: 'x',
      tags: 'a{b',
      status: 'altro',
      field: 'Chiave Non Valida!',
      archived: 'si',
    });
    expect(p).toMatchObject({
      category: null,
      tags: [],
      status: null,
      fieldKey: null,
      archived: false,
    });
  });

  it('limita la lunghezza del testo', () => {
    expect(parseSearchParams({ q: 'x'.repeat(500) }).q).toHaveLength(200);
  });
});

describe('rpcArgs', () => {
  it('il valore del campo si invia solo con la chiave', () => {
    expect(rpcArgs(uuid, parseSearchParams({ value: 'x' }), 10).p_field_value).toBeUndefined();
    expect(rpcArgs(uuid, parseSearchParams({ field: 'k', value: 'x' }), 10)).toMatchObject({
      p_field_key: 'k',
      p_field_value: 'x',
      p_limit: 10,
    });
  });
});

describe('splitExcerpt', () => {
  it('separa i termini evidenziati', () => {
    expect(splitExcerpt('La <<torre>> è <<alta>>')).toEqual([
      { text: 'La ', mark: false },
      { text: 'torre', mark: true },
      { text: ' è ', mark: false },
      { text: 'alta', mark: true },
    ]);
  });
  it('non interpreta HTML e gestisce il testo senza marcatori', () => {
    expect(splitExcerpt('<b>x</b>')).toEqual([{ text: '<b>x</b>', mark: false }]);
    expect(splitExcerpt('')).toEqual([]);
  });
});
