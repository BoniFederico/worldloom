import { describe, expect, it } from 'vitest';
import { clientErrorSchema } from './client-error-schema';

describe('clientErrorSchema', () => {
  it('accetta nome e percorso, con digest opzionale', () => {
    expect(clientErrorSchema.safeParse({ name: 'TypeError', path: '/worlds/abc' }).success).toBe(
      true,
    );
    expect(
      clientErrorSchema.safeParse({ name: 'TypeError', digest: 'abc123', path: '/worlds/abc' })
        .success,
    ).toBe(true);
  });

  it('rifiuta payload senza nome o percorso', () => {
    expect(clientErrorSchema.safeParse({ path: '/x' }).success).toBe(false);
    expect(clientErrorSchema.safeParse({ name: 'TypeError' }).success).toBe(false);
    expect(clientErrorSchema.safeParse({}).success).toBe(false);
  });

  it('rifiuta stringhe troppo lunghe', () => {
    expect(clientErrorSchema.safeParse({ name: 'a'.repeat(81), path: '/x' }).success).toBe(false);
    expect(
      clientErrorSchema.safeParse({ name: 'TypeError', path: '/'.padEnd(201, 'x') }).success,
    ).toBe(false);
  });
});
