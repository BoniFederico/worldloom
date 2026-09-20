import { describe, expect, it } from 'vitest';
import { parseAliases, parseTags } from './labels';

describe('parseTags', () => {
  it('separa per virgola o a capo, normalizza e mette in minuscolo', () => {
    expect(parseTags('Magia,  Draghi\nAntichi Regni ,, ')).toEqual({
      ok: true,
      values: ['magia', 'draghi', 'antichi regni'],
    });
  });

  it('unisce i doppioni senza badare alle maiuscole', () => {
    expect(parseTags('a, A, a')).toEqual({ ok: true, values: ['a'] });
  });

  it('un campo vuoto dà nessun tag', () => {
    expect(parseTags(' , \n ')).toEqual({ ok: true, values: [] });
  });

  it('rifiuta un tag troppo lungo e troppi tag', () => {
    expect(parseTags('x'.repeat(41))).toEqual({ ok: false });
    expect(parseTags(Array.from({ length: 31 }, (_, i) => `t${i}`).join(','))).toEqual({
      ok: false,
    });
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).ok).toBe(true);
  });
});

describe('parseAliases', () => {
  it('conserva la grafia e unisce i doppioni', () => {
    expect(parseAliases('Il Lupo Grigio\nil lupo grigio, Gandalf')).toEqual({
      ok: true,
      values: ['Il Lupo Grigio', 'Gandalf'],
    });
  });

  it('rifiuta un alias troppo lungo e troppi alias', () => {
    expect(parseAliases('x'.repeat(101))).toEqual({ ok: false });
    expect(parseAliases(Array.from({ length: 21 }, (_, i) => `a${i}`).join('\n'))).toEqual({
      ok: false,
    });
  });
});
