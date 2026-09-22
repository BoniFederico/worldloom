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

  it('rifiuta un percorso che non ha la forma di un percorso dell’app', () => {
    expect(
      clientErrorSchema.safeParse({ name: 'TypeError', path: 'https://evil.test/x' }).success,
    ).toBe(false);
    expect(
      clientErrorSchema.safeParse({ name: 'TypeError', path: 'testo qualsiasi con spazi' }).success,
    ).toBe(false);
    expect(clientErrorSchema.safeParse({ name: 'TypeError', path: 'worlds/abc' }).success).toBe(
      false,
    );
  });

  it('accetta percorsi tipici dell’app', () => {
    expect(
      clientErrorSchema.safeParse({ name: 'TypeError', path: '/worlds/abc-123/snippets/xyz' })
        .success,
    ).toBe(true);
  });
});
