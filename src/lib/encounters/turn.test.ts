import { describe, expect, it } from 'vitest';
import { advanceTurn, currentTurnIndex, orderByInitiative } from './turn';

describe('orderByInitiative', () => {
  it('ordina per iniziativa decrescente', () => {
    const rows = [
      { id: 'a', initiative: 10, created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', initiative: 18, created_at: '2026-01-01T00:00:01Z' },
      { id: 'c', initiative: 14, created_at: '2026-01-01T00:00:02Z' },
    ];
    expect(orderByInitiative(rows).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('a parità di iniziativa, chi è stato aggiunto prima resta prima', () => {
    const rows = [
      { id: 'a', initiative: 10, created_at: '2026-01-01T00:00:02Z' },
      { id: 'b', initiative: 10, created_at: '2026-01-01T00:00:01Z' },
    ];
    expect(orderByInitiative(rows).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('non muta l’array originale', () => {
    const rows = [
      { id: 'a', initiative: 1, created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', initiative: 2, created_at: '2026-01-01T00:00:00Z' },
    ];
    const copy = [...rows];
    orderByInitiative(rows);
    expect(rows).toEqual(copy);
  });
});

describe('advanceTurn', () => {
  it('avanza al partecipante successivo nello stesso round', () => {
    expect(advanceTurn(3, 1, 0)).toEqual({ round: 1, turnIndex: 1 });
    expect(advanceTurn(3, 1, 1)).toEqual({ round: 1, turnIndex: 2 });
  });

  it('torna al primo e passa al round successivo dopo l’ultimo', () => {
    expect(advanceTurn(3, 1, 2)).toEqual({ round: 2, turnIndex: 0 });
  });

  it('resta a zero senza partecipanti', () => {
    expect(advanceTurn(0, 3, 5)).toEqual({ round: 3, turnIndex: 0 });
  });
});

describe('currentTurnIndex', () => {
  it('riporta l’indice nell’intervallo valido se i partecipanti sono diminuiti', () => {
    expect(currentTurnIndex(2, 5)).toBe(1);
  });

  it('è zero senza partecipanti', () => {
    expect(currentTurnIndex(0, 3)).toBe(0);
  });
});
