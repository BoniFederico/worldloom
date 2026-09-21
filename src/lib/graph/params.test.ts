import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH, graphQuery, parseGraphConfig, parseGraphParams } from './params';

const ID = '11111111-1111-4111-8111-111111111111';

describe('parseGraphParams', () => {
  it('senza parametri usa i valori predefiniti', () => {
    expect(parseGraphParams({})).toEqual(DEFAULT_GRAPH);
    expect(DEFAULT_GRAPH).toEqual({
      center: null,
      depth: 2,
      label: null,
      category: null,
      mentions: true,
    });
  });

  it('legge centro, profondità, etichetta, categoria e menzioni', () => {
    expect(
      parseGraphParams({
        center: ID,
        depth: '3',
        label: '  alleato   di ',
        category: ID,
        mentions: '0',
      }),
    ).toEqual({ center: ID, depth: 3, label: 'alleato di', category: ID, mentions: false });
  });

  it('riporta nei limiti o scarta i valori non validi, senza errori', () => {
    const p = parseGraphParams({
      center: 'non-uuid',
      depth: '99',
      label: 'x'.repeat(500),
      category: '../../etc',
      mentions: 'forse',
    });
    expect(p.center).toBeNull();
    expect(p.depth).toBe(4);
    expect(p.label?.length).toBe(120);
    expect(p.category).toBeNull();
    expect(p.mentions).toBe(true);
    expect(parseGraphParams({ depth: '-5' }).depth).toBe(0);
    expect(parseGraphParams({ depth: 'abc' }).depth).toBe(2);
  });

  it('un parametro ripetuto vale come il primo', () => {
    expect(parseGraphParams({ depth: ['1', '3'] }).depth).toBe(1);
  });
});

describe('graphQuery / parseGraphConfig', () => {
  it('round trip tramite query string', () => {
    const p = parseGraphParams({ center: ID, depth: '1', label: 'vive a', mentions: '0' });
    expect(parseGraphParams(Object.fromEntries(new URLSearchParams(graphQuery(p))))).toEqual(p);
  });

  it('non scrive i valori predefiniti', () => {
    expect(graphQuery(DEFAULT_GRAPH)).toBe('');
  });

  it('la configurazione salvata (jsonb) passa dallo stesso parsing e non fallisce con input ostili', () => {
    for (const input of [null, 'x', [], 7, { depth: {} }, { center: 42, mentions: 'sì' }]) {
      expect(() => parseGraphConfig(input)).not.toThrow();
    }
    expect(parseGraphConfig({ depth: 3, label: 'a', mentions: false }).depth).toBe(3);
  });
});
