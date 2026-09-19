import { describe, expect, it } from 'vitest';
import { credentialsSchema, emailSchema, newPasswordSchema, signUpSchema } from './schemas';

describe('emailSchema', () => {
  it('normalizza spazi e maiuscole', () => {
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });
  it('rifiuta indirizzi non validi', () => {
    expect(emailSchema.safeParse('non-una-email').success).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it.each([
    ['Breve1a', 'troppo corta'],
    ['tuttominuscolo123', 'senza maiuscole'],
    ['TUTTOMAIUSCOLO123', 'senza minuscole'],
    ['SenzaNumeriQui', 'senza cifre'],
  ])('rifiuta %s (%s)', (password) => {
    expect(newPasswordSchema.safeParse(password).success).toBe(false);
  });
  it('accetta una password conforme', () => {
    expect(newPasswordSchema.safeParse('Valida12345').success).toBe(true);
  });
});

describe('signUpSchema', () => {
  it('richiede un nome visualizzato non vuoto', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.it',
      password: 'Valida12345',
      displayName: '  ',
    });
    expect(r.success).toBe(false);
  });
  it('accetta dati validi e ripulisce il nome', () => {
    const r = signUpSchema.parse({
      email: 'A@b.it',
      password: 'Valida12345',
      displayName: ' Ada ',
    });
    expect(r).toEqual({ email: 'a@b.it', password: 'Valida12345', displayName: 'Ada' });
  });
});

describe('credentialsSchema', () => {
  it('per il login non impone la complessità (solo presenza)', () => {
    expect(credentialsSchema.safeParse({ email: 'a@b.it', password: 'x' }).success).toBe(true);
    expect(credentialsSchema.safeParse({ email: 'a@b.it', password: '' }).success).toBe(false);
  });
});
