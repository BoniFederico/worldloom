import { describe, expect, it } from 'vitest';
import { parseRelationType } from './types';

const uuid = '123e4567-e89b-12d3-a456-426614174000';
const form = (values: Record<string, string | undefined>) => (name: string) => values[name];

describe('parseRelationType', () => {
  it('accetta solo l’etichetta', () => {
    expect(parseRelationType(form({ label: '  alleato   di ' }))).toEqual({
      ok: true,
      value: { label: 'alleato di', inverse: null, source: null, target: null },
    });
  });

  it('legge inversa e categorie', () => {
    expect(
      parseRelationType(
        form({ label: 'nato a', inverse: 'luogo di nascita di', source: uuid, target: uuid }),
      ),
    ).toEqual({
      ok: true,
      value: { label: 'nato a', inverse: 'luogo di nascita di', source: uuid, target: uuid },
    });
  });

  it('rifiuta etichetta vuota o troppo lunga', () => {
    expect(parseRelationType(form({ label: ' ' }))).toEqual({ ok: false, error: 'invalid_label' });
    expect(parseRelationType(form({ label: 'x'.repeat(121) }))).toEqual({
      ok: false,
      error: 'invalid_label',
    });
    expect(parseRelationType(form({ label: 'a', inverse: 'x'.repeat(121) }))).toEqual({
      ok: false,
      error: 'invalid_label',
    });
  });

  it('rifiuta una categoria che non è un identificativo', () => {
    expect(parseRelationType(form({ label: 'a', source: 'x' }))).toEqual({
      ok: false,
      error: 'invalid_category',
    });
  });
});
