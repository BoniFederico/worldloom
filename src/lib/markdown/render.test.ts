import { describe, expect, it } from 'vitest';
import type { DocNode } from '@/lib/snippets/body';
import { markdownToDoc } from './doc';
import { docToMarkdown } from './render';

const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const text = (t: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text: t, marks });

describe('docToMarkdown', () => {
  it('un paragrafo semplice', () => {
    expect(docToMarkdown(doc(paragraph(text('Ciao mondo.'))))).toBe('Ciao mondo.');
  });

  it('titoli, grassetto, corsivo, codice e link', () => {
    const md = docToMarkdown(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Titolo')] },
        paragraph(
          text('forte', [{ type: 'bold' }]),
          text(' e '),
          text('corsivo', [{ type: 'italic' }]),
          text(' e '),
          text('codice', [{ type: 'code' }]),
          text(' e '),
          text('link', [{ type: 'link', attrs: { href: 'https://esempio.test' } }]),
        ),
      ),
    );
    expect(md).toBe('## Titolo\n\n**forte** e *corsivo* e `codice` e [link](https://esempio.test)');
  });

  it('liste puntate e numerate', () => {
    const bullets = docToMarkdown(
      doc({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph(text('uno'))] },
          { type: 'listItem', content: [paragraph(text('due'))] },
        ],
      }),
    );
    expect(bullets).toBe('- uno\n- due');

    const numbered = docToMarkdown(
      doc({
        type: 'orderedList',
        content: [{ type: 'listItem', content: [paragraph(text('uno'))] }],
      }),
    );
    expect(numbered).toBe('1. uno');
  });

  it('citazioni', () => {
    const quote = docToMarkdown(doc({ type: 'blockquote', content: [paragraph(text('saggio'))] }));
    expect(quote).toBe('> saggio');
  });

  it('menzioni risolte diventano wikilink, quelle non risolte spariscono', () => {
    const withMention = (resolve: (id: string) => string | null) =>
      docToMarkdown(
        doc(paragraph(text('Vive a '), { type: 'mention', attrs: { id: 's1' } })),
        resolve,
      );
    expect(withMention((id) => (id === 's1' ? 'Porto Verde' : null))).toBe(
      'Vive a [[Porto Verde]]',
    );
    expect(withMention(() => null)).toBe('Vive a ');
  });

  it('round trip andata e ritorno per il sottoinsieme comune con markdownToDoc', () => {
    const markdown = '# Titolo\n\nUn paragrafo con **forte** e [[Elara]].\n\n- uno\n- due';
    const resolved = markdownToDoc(markdown, (title) => (title === 'Elara' ? 's1' : null));
    const back = docToMarkdown(resolved, (id) => (id === 's1' ? 'Elara' : null));
    expect(back).toBe(markdown);
  });
});
