import { describe, expect, it } from 'vitest';
import { getHealth } from './health';

describe('getHealth', () => {
  it('riporta stato ok con l’orario ISO passato', () => {
    expect(getHealth(new Date('2026-01-02T03:04:05Z'))).toEqual({
      status: 'ok',
      time: '2026-01-02T03:04:05.000Z',
    });
  });
});
