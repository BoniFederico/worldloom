import { describe, expect, it } from 'vitest';
import { withRestricted, type Restricted } from './restricted';

const restricted: Restricted = {
  values: new Map([['s1', { segreto: 'x' }]]),
  levels: new Map([['s1', { segreto: 'secret' }]]),
};

describe('withRestricted', () => {
  it('unisce i valori riservati leggibili ai campi pubblici', () => {
    expect(withRestricted('s1', { eta: 1 }, restricted)).toEqual({ eta: 1, segreto: 'x' });
  });

  it('senza valori riservati (o per un altro snippet) restituisce i campi così come sono', () => {
    const fields = { eta: 1 };
    expect(withRestricted('s2', fields, restricted)).toBe(fields);
  });
});
