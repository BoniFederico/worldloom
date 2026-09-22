import type { DocNode } from '@/lib/snippets/body';

/**
 * Converte un sottoinsieme di Markdown in un documento ProseMirror grezzo (titoli, paragrafi, liste, citazioni,
 * grassetto/corsivo/codice, link, wikilink `[[...]]`). Non è un parser CommonMark completo: copre ciò che scrive
 * comunemente Obsidian/un editor di testo. Il risultato passa sempre da `validateBody` prima di essere salvato:
 * questa funzione non è un confine di sicurezza.
 */

/** Risolve un wikilink al titolo in un id di snippet del mondo importato, se esiste. */
export type ResolveWikilink = (title: string) => string | null;

function inline(text: string, resolve: ResolveWikilink): DocNode[] {
  const nodes: DocNode[] = [];
  // Ordine di priorità: wikilink, link markdown, grassetto, corsivo, codice inline.
  const pattern =
    /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]|\[([^[\]]+)]\(([^()\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (str: string) => {
    if (str) nodes.push({ type: 'text', text: str });
  };
  while ((match = pattern.exec(text))) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    const wikilink = match[1];
    if (wikilink !== undefined) {
      // Wikilink: risolto -> menzione (solo id, il titolo si risolve in lettura); non risolto -> testo semplice.
      const title = wikilink.trim();
      const id = resolve(title);
      if (id) nodes.push({ type: 'mention', attrs: { id } });
      else push(match[2]?.trim() || title);
    } else if (match[3] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[3],
        marks: [{ type: 'link', attrs: { href: match[4] ?? '' } }],
      });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      nodes.push({
        type: 'text',
        text: (match[5] ?? match[6]) as string,
        marks: [{ type: 'bold' }],
      });
    } else if (match[7] !== undefined) {
      nodes.push({ type: 'text', text: match[7], marks: [{ type: 'code' }] });
    } else {
      nodes.push({
        type: 'text',
        text: (match[8] ?? match[9]) as string,
        marks: [{ type: 'italic' }],
      });
    }
  }
  push(text.slice(last));
  return nodes;
}

function paragraph(text: string, resolve: ResolveWikilink): DocNode {
  return { type: 'paragraph', content: inline(text.replace(/\n/g, ' ').trim(), resolve) };
}

/** Righe consecutive di una lista (stesso marcatore) raggruppate in voci; ogni voce è un paragrafo. */
function listBlock(lines: string[], ordered: boolean, resolve: ResolveWikilink): DocNode {
  const marker = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: lines.map((line) => {
      const text = line.match(marker)?.[1] ?? line;
      return { type: 'listItem', content: [paragraph(text, resolve)] };
    }),
  };
}

const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
const isOrdered = (line: string) => /^\s*\d+\.\s+/.test(line);
const isHeading = (line: string) => /^#{1,6}\s+/.test(line);
const isQuote = (line: string) => /^>\s?/.test(line);

export function markdownToDoc(markdown: string, resolve: ResolveWikilink = () => null): DocNode {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const at = (index: number): string => lines[index] ?? '';
  const blocks: DocNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const hashes = heading[1] ?? '#';
      blocks.push({
        type: 'heading',
        attrs: { level: hashes.length },
        content: inline((heading[2] ?? '').trim(), resolve),
      });
      i++;
      continue;
    }
    if (isBullet(line)) {
      const group: string[] = [];
      while (i < lines.length && isBullet(at(i))) group.push(at(i++));
      blocks.push(listBlock(group, false, resolve));
      continue;
    }
    if (isOrdered(line)) {
      const group: string[] = [];
      while (i < lines.length && isOrdered(at(i))) group.push(at(i++));
      blocks.push(listBlock(group, true, resolve));
      continue;
    }
    if (isQuote(line)) {
      const group: string[] = [];
      while (i < lines.length && isQuote(at(i))) group.push(at(i++).replace(/^>\s?/, ''));
      blocks.push({ type: 'blockquote', content: [paragraph(group.join(' '), resolve)] });
      continue;
    }
    // Paragrafo: righe consecutive non vuote e non riconosciute come altro blocco.
    const group: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() !== '' &&
      !isHeading(at(i)) &&
      !isBullet(at(i)) &&
      !isOrdered(at(i)) &&
      !isQuote(at(i))
    ) {
      group.push(at(i++));
    }
    blocks.push(paragraph(group.join('\n'), resolve));
  }
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
}
