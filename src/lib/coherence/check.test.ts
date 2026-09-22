import { describe, expect, it } from 'vitest';
import { isTemporalAnomaly } from './check';

describe('isTemporalAnomaly', () => {
  it('nessuna anomalia se manca un capo dell’intervallo', () => {
    expect(isTemporalAnomaly(null, { year: 1200 })).toBe(false);
    expect(isTemporalAnomaly({ year: 1200 }, null)).toBe(false);
  });

  it('nessuna anomalia se gli anni differiscono (il database garantisce già from.year <= to.year)', () => {
    expect(isTemporalAnomaly({ year: 1200 }, { year: 1210 })).toBe(false);
  });

  it('nessuna anomalia se manca il mese su un capo (precisione insufficiente per dire che è invertito)', () => {
    expect(isTemporalAnomaly({ year: 1200 }, { year: 1200, month: 6 })).toBe(false);
    expect(isTemporalAnomaly({ year: 1200, month: 6 }, { year: 1200 })).toBe(false);
  });

  it('stesso anno, mese invertito: anomalia', () => {
    expect(isTemporalAnomaly({ year: 1200, month: 6 }, { year: 1200, month: 2 })).toBe(true);
  });

  it('stesso anno e mese, nessuna anomalia se manca il giorno su un capo', () => {
    expect(isTemporalAnomaly({ year: 1200, month: 6, day: 20 }, { year: 1200, month: 6 })).toBe(
      false,
    );
  });

  it('stesso anno e mese, giorno invertito: anomalia', () => {
    expect(
      isTemporalAnomaly({ year: 1200, month: 6, day: 20 }, { year: 1200, month: 6, day: 1 }),
    ).toBe(true);
  });

  it('stesso anno e mese, giorno coerente: nessuna anomalia', () => {
    expect(
      isTemporalAnomaly({ year: 1200, month: 6, day: 1 }, { year: 1200, month: 6, day: 20 }),
    ).toBe(false);
  });

  it('stesso giorno su entrambi i capi: nessuna anomalia (l’intervallo è di un solo giorno, non invertito)', () => {
    expect(
      isTemporalAnomaly({ year: 1200, month: 6, day: 10 }, { year: 1200, month: 6, day: 10 }),
    ).toBe(false);
  });

  it('anno uguale, mese crescente: nessuna anomalia', () => {
    expect(isTemporalAnomaly({ year: 1200, month: 2 }, { year: 1200, month: 6 })).toBe(false);
  });
});
