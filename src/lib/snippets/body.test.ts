import { describe, expect, it } from 'vitest';
import { docToText, EMPTY_DOC, sanitizeBody, textToDoc } from './body';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('sanitizeBody', () => {
  it('conserva titoli, liste, citazioni e marcature ammesse', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titolo' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [p('uno')] }],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'citato', marks: [{ type: 'bold' }, { type: 'italic' }] },
              ],
            },
          ],
        },
      ],
    };
    expect(sanitizeBody(doc)).toEqual(doc);
  });

  it('scarta nodi e marcature sconosciuti mantenendo il testo', () => {
    const result = sanitizeBody({
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'ok', marks: [{ type: 'blink' }] }] },
      ],
    });
    expect(result).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alert(1)' }] }, p('ok')],
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    ' JaVaScRiPt:x',
    '//evil.test',
    '/\\evil.test',
  ])('toglie il link con href non sicuro %s', (href) => {
    const doc = sanitizeBody({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
        },
      ],
    });
    expect(JSON.stringify(doc)).not.toContain('link');
    expect(JSON.stringify(doc)).toContain('"x"');
  });

  it('accetta link http, https, mailto e relativi', () => {
    for (const href of [
      'https://example.com/a?b=1',
      'http://example.com',
      'mailto:a@b.it',
      '/worlds/x',
    ]) {
      const doc = sanitizeBody({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
          },
        ],
      });
      expect(JSON.stringify(doc)).toContain(href);
    }
  });

  it('elimina gli attributi non ammessi', () => {
    const doc = sanitizeBody({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { onclick: 'x', style: 'y' }, content: [] }],
    });
    expect(JSON.stringify(doc)).not.toContain('onclick');
  });

  it('limita il livello dei titoli e la profondità', () => {
    const heading = sanitizeBody({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'x' }] }],
    });
    expect(heading.content?.[0]?.attrs).toEqual({ level: 3 });

    let deep: unknown = { type: 'text', text: 'fondo' };
    for (let i = 0; i < 60; i++) deep = { type: 'blockquote', content: [deep] };
    const result = sanitizeBody({ type: 'doc', content: [deep] });
    expect(JSON.stringify(result).length).toBeLessThan(2000);
  });

  it('scarta liste e citazioni vuote e toglie le voci fuori da una lista', () => {
    const doc = sanitizeBody({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [{ type: 'listItem' }] },
        { type: 'blockquote' },
        { type: 'listItem', content: [p('solo')] },
      ],
    });
    expect(doc).toEqual({ type: 'doc', content: [p('solo')] });
  });

  it('restituisce un documento vuoto per input non valido', () => {
    for (const bad of [null, 42, 'testo', [], { type: 'paragraph' }, undefined]) {
      expect(sanitizeBody(bad)).toEqual(EMPTY_DOC);
    }
  });

  it('rifiuta un corpo troppo grande', () => {
    const big = { type: 'doc', content: [p('x'.repeat(600_000))] };
    expect(sanitizeBody(big)).toEqual(EMPTY_DOC);
  });
});

describe('tabelle', () => {
  const cell = (type: string, text: string, attrs?: Record<string, unknown>) => ({
    type,
    ...(attrs ? { attrs } : {}),
    content: [p(text)],
  });
  const table = (rows: unknown[]) => ({ type: 'doc', content: [{ type: 'table', content: rows }] });

  it('conserva righe, celle e intestazioni', () => {
    const doc = table([
      { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
      { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2')] },
    ]);
    expect(sanitizeBody(doc)).toEqual(doc);
  });

  it('limita colspan e rowspan e scarta gli altri attributi', () => {
    const result = sanitizeBody(
      table([
        {
          type: 'tableRow',
          content: [
            cell('tableCell', 'x', { colspan: 999, rowspan: 2, colwidth: [10], onclick: 'x' }),
          ],
        },
      ]),
    );
    const attrs = result.content?.[0]?.content?.[0]?.content?.[0]?.attrs;
    expect(attrs).toEqual({ colspan: 20, rowspan: 2 });
  });

  it('una cella vuota resta una cella con un paragrafo', () => {
    const result = sanitizeBody(table([{ type: 'tableRow', content: [{ type: 'tableCell' }] }]));
    expect(result.content?.[0]?.content?.[0]?.content?.[0]).toEqual({
      type: 'tableCell',
      content: [{ type: 'paragraph' }],
    });
  });

  it('scarta righe e celle fuori posto mantenendo il testo', () => {
    const result = sanitizeBody({
      type: 'doc',
      content: [
        { type: 'tableRow', content: [cell('tableCell', 'orfana')] },
        cell('tableCell', 'sola'),
      ],
    });
    expect(result).toEqual({ type: 'doc', content: [p('orfana'), p('sola')] });
  });

  it('docToText separa le celle', () => {
    const doc = table([
      { type: 'tableRow', content: [cell('tableCell', 'A'), cell('tableCell', 'B')] },
    ]);
    expect(docToText(doc)).toBe('A | B');
  });
});

describe('textToDoc / docToText', () => {
  it('trasforma il testo in paragrafi, una riga vuota separa i paragrafi', () => {
    expect(textToDoc('uno\ndue\n\ntre')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'uno' },
            { type: 'hardBreak' },
            { type: 'text', text: 'due' },
          ],
        },
        p('tre'),
      ],
    });
  });

  it('il testo vuoto dà un documento vuoto', () => {
    expect(textToDoc('  \n ')).toEqual(EMPTY_DOC);
  });

  it('docToText è l’inverso per il testo semplice', () => {
    const text = 'uno\ndue\n\ntre';
    expect(docToText(textToDoc(text))).toBe(text);
  });

  it('non interpreta HTML nel testo', () => {
    const doc = textToDoc('<img src=x onerror=alert(1)>');
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: '<img src=x onerror=alert(1)>',
    });
  });
});
