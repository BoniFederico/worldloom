import { describe, expect, it } from 'vitest';
import { diffFields, diffLines, diffList, type VersionContent } from './diff';

describe('diffLines', () => {
  it('senza differenze restituisce solo righe invariate', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
  });

  it('segnala righe aggiunte e rimosse mantenendo l’ordine', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' },
    ]);
  });

  it('gestisce testo vuoto da un lato', () => {
    expect(diffLines('', 'a')).toEqual([{ type: 'add', text: 'a' }]);
    expect(diffLines('a', '')).toEqual([{ type: 'remove', text: 'a' }]);
    expect(diffLines('', '')).toEqual([]);
  });

  it('non esplode su testi molto lunghi', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `riga ${i}`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `riga ${i + 1}`).join('\n');
    const out = diffLines(a, b);
    expect(out.length).toBeGreaterThan(0);
    expect(out.filter((l) => l.type === 'add').length).toBeGreaterThan(0);
  });
});

describe('diffList', () => {
  it('elenca elementi aggiunti e rimossi', () => {
    expect(diffList(['eroe', 'elfo'], ['elfo', 'maga'])).toEqual({
      added: ['maga'],
      removed: ['eroe'],
    });
  });
});

describe('diffFields', () => {
  it('elenca campi aggiunti, rimossi e cambiati', () => {
    expect(diffFields({ a: 1, b: 'x', c: true }, { a: 2, b: 'x', d: 'nuovo' })).toEqual([
      { key: 'a', before: 1, after: 2 },
      { key: 'c', before: true, after: undefined },
      { key: 'd', before: undefined, after: 'nuovo' },
    ]);
  });

  it('confronta i valori strutturati per contenuto', () => {
    expect(diffFields({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });
});

describe('tipo VersionContent', () => {
  it('descrive il contenuto confrontabile', () => {
    const c: VersionContent = {
      title: 't',
      status: 'draft',
      body: {},
      fields: {},
      tags: [],
      aliases: [],
    };
    expect(c.title).toBe('t');
  });
});
