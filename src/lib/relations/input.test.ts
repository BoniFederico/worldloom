import { describe, expect, it } from 'vitest';
import { inverseFor, parseRelationInput, relationView, topLabels } from './input';

const uuid = '123e4567-e89b-12d3-a456-426614174000';
const form = (values: Record<string, string | undefined>) => (name: string) => values[name];
const base = { target: uuid, label: 'padre di' };
const invalid = (error: string) => ({ ok: false, error });

describe('parseRelationInput', () => {
  it('accetta una relazione minima e normalizza le etichette', () => {
    expect(
      parseRelationInput(form({ target: uuid, label: '  padre   di ', inverse: ' figlio di ' })),
    ).toEqual({
      ok: true,
      value: {
        target: uuid,
        label: 'padre di',
        inverse: 'figlio di',
        notes: '',
        from: null,
        to: null,
      },
    });
  });

  it('l’etichetta inversa è facoltativa', () => {
    const r = parseRelationInput(form(base));
    expect(r.ok && r.value.inverse).toBeNull();
  });

  it('rifiuta destinazione non valida ed etichetta vuota o troppo lunga', () => {
    expect(parseRelationInput(form({ ...base, target: 'x' }))).toEqual(invalid('invalid_target'));
    expect(parseRelationInput(form({ ...base, label: '  ' }))).toEqual(invalid('invalid_label'));
    expect(parseRelationInput(form({ ...base, label: 'x'.repeat(121) }))).toEqual(
      invalid('invalid_label'),
    );
    expect(parseRelationInput(form({ ...base, inverse: 'x'.repeat(121) }))).toEqual(
      invalid('invalid_label'),
    );
  });

  it('limita le note', () => {
    expect(parseRelationInput(form({ ...base, notes: 'x'.repeat(2001) }))).toEqual(
      invalid('invalid_notes'),
    );
    expect(parseRelationInput(form({ ...base, notes: 'x'.repeat(2000) })).ok).toBe(true);
  });

  it('legge l’intervallo di validità, anche con anni negativi', () => {
    const r = parseRelationInput(
      form({ ...base, from_year: '-300', from_month: '2', from_day: '10', to_year: '12' }),
    );
    expect(r.ok && r.value.from).toEqual({ calendar: 'default', year: -300, month: 2, day: 10 });
    expect(r.ok && r.value.to).toEqual({ calendar: 'default', year: 12 });
  });

  it('rifiuta intervalli incoerenti', () => {
    for (const bad of [
      { from_month: '3' }, // mese senza anno
      { from_year: '10', from_day: '5' }, // giorno senza mese
      { from_year: 'abc' },
      { from_year: '1', from_month: '0' },
      { from_year: '1.5' },
      { from_year: '10', to_year: '9' }, // fine prima dell'inizio
      { from_year: '10', from_month: '5', to_year: '10', to_month: '4' },
    ]) {
      expect(parseRelationInput(form({ ...base, ...bad }))).toEqual(invalid('invalid_validity'));
    }
  });

  it('accetta inizio e fine uguali', () => {
    expect(parseRelationInput(form({ ...base, from_year: '10', to_year: '10' })).ok).toBe(true);
  });
});

describe('relationView', () => {
  const row = {
    id: 'r',
    source_id: 'a',
    target_id: 'b',
    label: 'padre di',
    inverse_label: 'figlio di',
  };
  it('in uscita usa l’etichetta', () => {
    expect(relationView(row, 'a')).toMatchObject({
      direction: 'out',
      otherId: 'b',
      label: 'padre di',
      reversed: false,
    });
  });
  it('in ingresso usa l’inversa se c’è', () => {
    expect(relationView(row, 'b')).toMatchObject({
      direction: 'in',
      otherId: 'a',
      label: 'figlio di',
      reversed: false,
    });
  });
  it('in ingresso senza inversa mostra l’etichetta originale, segnalata come rovesciata', () => {
    expect(relationView({ ...row, inverse_label: null }, 'b')).toMatchObject({
      direction: 'in',
      label: 'padre di',
      reversed: true,
    });
  });
});

describe('topLabels', () => {
  it('ordina per frequenza senza badare alle maiuscole e ignora i vuoti', () => {
    expect(
      topLabels(['alleato di', 'Padre di', 'padre di', null, 'alleato di', 'padre di']),
    ).toEqual(['Padre di', 'alleato di']);
  });
  it('rispetta il limite', () => {
    expect(topLabels(['a', 'b', 'c'], 2)).toHaveLength(2);
  });
});

describe('inverseFor', () => {
  const rows = [
    { label: 'figlio di', inverse_label: 'padre di' },
    { label: 'alleato di', inverse_label: null },
  ];
  it('riusa l’inversa già associata all’etichetta', () => {
    expect(inverseFor(' Figlio  DI ', rows)).toBe('padre di');
  });
  it('se l’etichetta è a sua volta un’inversa, la sua inversa è l’altra etichetta', () => {
    expect(inverseFor('padre di', rows)).toBe('figlio di');
  });
  it('senza corrispondenze o con caratteri speciali non riusa nulla', () => {
    expect(inverseFor('alleato di', rows)).toBeNull();
    expect(inverseFor('fig*', rows)).toBeNull();
    expect(inverseFor('%', rows)).toBeNull();
  });
});
