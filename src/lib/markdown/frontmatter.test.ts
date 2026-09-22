import { describe, expect, it } from 'vitest';
import { asList, parseFrontMatter } from './frontmatter';

describe('parseFrontMatter', () => {
  it('legge chiave: valore e restituisce il corpo separato', () => {
    const { data, body } = parseFrontMatter('---\ntitle: Aragorn\nstatus: final\n---\nCiao mondo.');
    expect(data).toEqual({ title: 'Aragorn', status: 'final' });
    expect(body).toBe('Ciao mondo.');
  });

  it('legge liste tra parentesi quadre', () => {
    const { data } = parseFrontMatter('---\ntags: [eroe, ranger]\n---\n');
    expect(data.tags).toEqual(['eroe', 'ranger']);
  });

  it('legge liste a righe con trattino', () => {
    const { data } = parseFrontMatter('---\naliases:\n  - Grampasso\n  - Elessar\n---\n');
    expect(data.aliases).toEqual(['Grampasso', 'Elessar']);
  });

  it('toglie le virgolette dai valori scalari', () => {
    const { data } = parseFrontMatter('---\ntitle: "Il Re"\n---\n');
    expect(data.title).toBe('Il Re');
  });

  it('un file senza front matter è tutto corpo', () => {
    const { data, body } = parseFrontMatter('Solo testo, senza delimitatori.');
    expect(data).toEqual({});
    expect(body).toBe('Solo testo, senza delimitatori.');
  });

  it('un delimitatore di apertura senza chiusura è trattato come corpo', () => {
    const { data, body } = parseFrontMatter('---\ntitle: senza fine');
    expect(data).toEqual({});
    expect(body).toBe('---\ntitle: senza fine');
  });

  it('normalizza i fine riga CRLF', () => {
    const { data, body } = parseFrontMatter('---\r\ntitle: Aragorn\r\n---\r\nCiao');
    expect(data.title).toBe('Aragorn');
    expect(body).toBe('Ciao');
  });
});

describe('asList', () => {
  it('accetta un array così com’è', () => {
    expect(asList(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('divide una stringa separata da virgole', () => {
    expect(asList('a, b,  c')).toEqual(['a', 'b', 'c']);
  });

  it('restituisce un array vuoto per undefined', () => {
    expect(asList(undefined)).toEqual([]);
  });
});
