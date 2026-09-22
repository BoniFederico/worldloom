import { describe, expect, it } from 'vitest';
import { slugify, snippetPath, wikiSlugSchema, wikiSnippetIdFromPath } from './slug';

describe('slugify', () => {
  it('normalizza lettere accentate, spazi e maiuscole', () => {
    expect(slugify('Città di Edaline')).toBe('citta-di-edaline');
  });

  it('scarta simboli e taglia i trattini ai bordi', () => {
    expect(slugify('  ---Il Re! (bozza)---  ')).toBe('il-re-bozza');
  });

  it('restituisce una stringa vuota se non resta nulla di utile', () => {
    expect(slugify('***')).toBe('');
  });

  it('tronca a 60 caratteri', () => {
    expect(slugify('a'.repeat(100)).length).toBe(60);
  });
});

describe('wikiSlugSchema', () => {
  it('accetta minuscole, cifre e trattini singoli tra 3 e 60 caratteri', () => {
    expect(wikiSlugSchema.safeParse('aurelia').success).toBe(true);
    expect(wikiSlugSchema.safeParse('regno-di-aurelia-2').success).toBe(true);
  });

  it('rifiuta maiuscole, spazi, trattini doppi o ai bordi, e lunghezze fuori range', () => {
    for (const bad of [
      'Aurelia',
      'ab',
      'a '.repeat(40),
      '-aurelia',
      'aurelia-',
      'au--relia',
      'au relia',
    ]) {
      expect(wikiSlugSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('snippetPath / wikiSnippetIdFromPath', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('costruisce un percorso leggibile con l’id come suffisso', () => {
    expect(snippetPath({ id, title: 'Aragorn, figlio di Arathorn' })).toBe(
      `aragorn-figlio-di-arathorn-${id}`,
    );
  });

  it('usa solo l’id come percorso quando il titolo non produce testo utile', () => {
    expect(snippetPath({ id, title: '***' })).toBe(id);
  });

  it('estrae l’id dal percorso a prescindere dal prefisso leggibile', () => {
    expect(wikiSnippetIdFromPath(`aragorn-${id}`)).toBe(id);
    expect(wikiSnippetIdFromPath(id)).toBe(id);
  });

  it('restituisce null per un percorso senza id valido in coda', () => {
    expect(wikiSnippetIdFromPath('aragorn-non-un-id')).toBeNull();
    expect(wikiSnippetIdFromPath('')).toBeNull();
  });
});
