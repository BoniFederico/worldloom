import { describe, expect, it } from 'vitest';
import { validateBody } from '@/lib/snippets/body';
import { markdownToDoc } from './doc';

describe('markdownToDoc', () => {
  it('un paragrafo semplice', () => {
    expect(markdownToDoc('Ciao mondo.')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ciao mondo.' }] }],
    });
  });

  it('titoli di livello 1-6', () => {
    const doc = markdownToDoc('# Titolo\n\n## Sotto');
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(doc.content?.[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  });

  it('grassetto, corsivo, codice e link', () => {
    const doc = markdownToDoc('**forte** e *corsivo* e `codice` e [link](https://esempio.test)');
    const content = doc.content?.[0]?.content ?? [];
    expect(content).toEqual([
      { type: 'text', text: 'forte', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' e ' },
      { type: 'text', text: 'corsivo', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' e ' },
      { type: 'text', text: 'codice', marks: [{ type: 'code' }] },
      { type: 'text', text: ' e ' },
      {
        type: 'text',
        text: 'link',
        marks: [{ type: 'link', attrs: { href: 'https://esempio.test' } }],
      },
    ]);
  });

  it('liste puntate e numerate', () => {
    const bullets = markdownToDoc('- uno\n- due');
    expect(bullets.content?.[0]).toMatchObject({
      type: 'bulletList',
      content: [{ type: 'listItem' }, { type: 'listItem' }],
    });
    const numbered = markdownToDoc('1. uno\n2. due');
    expect(numbered.content?.[0]?.type).toBe('orderedList');
  });

  it('citazioni', () => {
    const doc = markdownToDoc('> una citazione');
    expect(doc.content?.[0]?.type).toBe('blockquote');
  });

  it('un wikilink risolto diventa una menzione; uno non risolto resta testo', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const doc = markdownToDoc('Vedi [[Aragorn]] e [[Sconosciuto]].', (title) =>
      title === 'Aragorn' ? id : null,
    );
    const content = doc.content?.[0]?.content ?? [];
    expect(content).toContainEqual({ type: 'mention', attrs: { id } });
    expect(content.some((n) => n.type === 'text' && n.text === 'Sconosciuto')).toBe(true);
  });

  it('un wikilink con alias usa l’alias come testo quando non risolto', () => {
    const doc = markdownToDoc('[[Titolo Vero|alias mostrato]]', () => null);
    expect(doc.content?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'alias mostrato' });
  });

  it('un file vuoto produce un paragrafo vuoto', () => {
    expect(markdownToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('il risultato passa sempre validateBody', () => {
    const doc = markdownToDoc('# T\n\n- a\n- b\n\n> nota\n\n**forte**');
    expect(validateBody(doc)).not.toBeNull();
  });
});
