import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('righe e colonne separate da virgola', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('campi tra virgolette con virgole e a-capo interni', () => {
    expect(parseCsv('titolo,note\n"Elara","abita a Porto, città portuale"')).toEqual([
      ['titolo', 'note'],
      ['Elara', 'abita a Porto, città portuale'],
    ]);
    expect(parseCsv('a\n"riga\nsu due"')).toEqual([['a'], ['riga\nsu due']]);
  });

  it('virgolette letterali raddoppiate', () => {
    expect(parseCsv('a\n"lui disse ""ciao"""')).toEqual([['a'], ['lui disse "ciao"']]);
  });

  it('gestisce CRLF e un a-capo finale', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('rimuove il BOM iniziale', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('un testo vuoto non produce righe', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
