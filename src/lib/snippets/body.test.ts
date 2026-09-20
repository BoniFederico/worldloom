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
