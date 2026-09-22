import { describe, expect, it } from 'vitest';
import { diceModeSchema, labelSchema, notationSchema } from './input';

describe('notationSchema', () => {
  it('accetta una notazione valida', () => {
    expect(notationSchema.safeParse('2d6+3').success).toBe(true);
  });
  it('rifiuta una stringa vuota', () => {
    expect(notationSchema.safeParse('   ').success).toBe(false);
  });
  it('rifiuta una notazione troppo lunga', () => {
    expect(notationSchema.safeParse('1d6+'.repeat(100)).success).toBe(false);
  });
});

describe('diceModeSchema', () => {
  it('accetta solo i tre modi noti', () => {
    expect(diceModeSchema.safeParse('advantage').success).toBe(true);
    expect(diceModeSchema.safeParse('critical').success).toBe(false);
  });
});

describe('labelSchema', () => {
  it('accetta una stringa vuota (etichetta facoltativa)', () => {
    expect(labelSchema.safeParse('').success).toBe(true);
  });
  it('rifiuta oltre 120 caratteri', () => {
    expect(labelSchema.safeParse('x'.repeat(121)).success).toBe(false);
  });
});
