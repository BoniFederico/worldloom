import { describe, expect, it } from 'vitest';
import { COMMENT_MAX, commentSchema } from './input';

describe('commentSchema', () => {
  it('accetta un testo non vuoto e lo pulisce dagli spazi ai lati', () => {
    const r = commentSchema.safeParse('  Bella idea!  ');
    expect(r.success).toBe(true);
    expect(r.data).toBe('Bella idea!');
  });

  it('rifiuta il vuoto o il solo spazio', () => {
    expect(commentSchema.safeParse('').success).toBe(false);
    expect(commentSchema.safeParse('   ').success).toBe(false);
  });

  it(`rifiuta oltre ${COMMENT_MAX} caratteri`, () => {
    expect(commentSchema.safeParse('a'.repeat(COMMENT_MAX)).success).toBe(true);
    expect(commentSchema.safeParse('a'.repeat(COMMENT_MAX + 1)).success).toBe(false);
  });
});
