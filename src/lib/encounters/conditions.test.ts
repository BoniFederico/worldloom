import { describe, expect, it } from 'vitest';
import { MAX_CONDITIONS, MAX_CONDITION_LENGTH, parseConditions } from './conditions';

describe('parseConditions', () => {
  it('legge condizioni separate da virgola, con spazi normalizzati', () => {
    const result = parseConditions('Stordito,  a terra , invisibile');
    expect(result).toEqual({ ok: true, values: ['Stordito', 'a terra', 'invisibile'] });
  });

  it('unisce i doppioni senza badare alle maiuscole', () => {
    const result = parseConditions('Stordito, stordito, STORDITO');
    expect(result).toEqual({ ok: true, values: ['Stordito'] });
  });

  it('scarta le voci vuote', () => {
    expect(parseConditions(' , , ')).toEqual({ ok: true, values: [] });
  });

  it('rifiuta una condizione troppo lunga', () => {
    const result = parseConditions('x'.repeat(MAX_CONDITION_LENGTH + 1));
    expect(result).toEqual({ ok: false });
  });

  it('rifiuta troppe condizioni', () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, (_, i) => `c${i}`).join(',');
    expect(parseConditions(many)).toEqual({ ok: false });
  });
});
