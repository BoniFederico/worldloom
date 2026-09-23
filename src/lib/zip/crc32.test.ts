import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';

describe('crc32', () => {
  it('calcola 0 per un buffer vuoto', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('corrisponde al vettore di test noto "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});
