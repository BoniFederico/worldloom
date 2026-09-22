import { describe, expect, it } from 'vitest';
import { postSchema, sessionSchema } from './input';

describe('sessionSchema', () => {
  it('accetta titolo e data vuoti, e normalizza la data mancante a null', () => {
    const r = sessionSchema.safeParse({ title: '  ', playedOn: '', summary: '' });
    expect(r.success && r.data).toEqual({ title: '', playedOn: null, summary: '' });
  });

  it('accetta una data ISO e la mantiene', () => {
    const r = sessionSchema.safeParse({ title: 'Prima', playedOn: '2026-09-20', summary: 'x' });
    expect(r.success && r.data.playedOn).toBe('2026-09-20');
  });

  it('rifiuta una data non ISO e un titolo troppo lungo', () => {
    expect(
      sessionSchema.safeParse({ title: '', playedOn: '20/09/2026', summary: '' }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({ title: 'x'.repeat(151), playedOn: '', summary: '' }).success,
    ).toBe(false);
  });
});

describe('postSchema', () => {
  it('accetta testo non vuoto entro il limite, tagliando gli spazi ai bordi', () => {
    const r = postSchema.safeParse('  Ciao a tutti.  ');
    expect(r.success && r.data).toBe('Ciao a tutti.');
  });

  it('rifiuta vuoto, solo spazi, o oltre 5000 caratteri', () => {
    expect(postSchema.safeParse('').success).toBe(false);
    expect(postSchema.safeParse('   ').success).toBe(false);
    expect(postSchema.safeParse('x'.repeat(5001)).success).toBe(false);
    expect(postSchema.safeParse('x'.repeat(5000)).success).toBe(true);
  });
});
