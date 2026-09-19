import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it('accetta percorsi interni', () => {
    expect(safeNextPath('/account')).toBe('/account');
    expect(safeNextPath('/mondi?x=1')).toBe('/mondi?x=1');
  });

  it.each([
    null,
    undefined,
    '',
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    'javascript:alert(1)',
  ])('rifiuta %s ricadendo su /', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });
});
