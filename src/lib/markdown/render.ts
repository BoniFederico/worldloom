import type { DocNode } from '@/lib/snippets/body';

/**
 * Converte un documento ProseMirror in Markdown, inverso (non completo) di `markdownToDoc`: copre lo stesso
 * sottoinsieme (titoli, paragrafi, liste, citazioni, grassetto/corsivo/codice, link, menzioni come wikilink).
 * Solo per la rappresentazione leggibile dei file .md esportati (#100): la fedeltà del round trip viene dal
 * file JSON incluso nello stesso archivio, non da questo testo. Nodi non coperti (tabelle, immagini) vengono
 * omessi in silenzio.
 */
export type ResolveMention = (id: string) => string | null;

function inline(nodes: DocNode[] | undefined, resolve: ResolveMention): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type === 'mention') {
        const id = typeof n.attrs?.id === 'string' ? n.attrs.id : null;
        const title = id ? resolve(id) : null;
        return title ? `[[${title}]]` : '';
      }
      if (n.type !== 'text') return '';
      let text = n.text ?? '';
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      if (marks.has('code')) text = `\`${text}\``;
      if (marks.has('bold')) text = `**${text}**`;
      if (marks.has('italic')) text = `*${text}*`;
      const link = (n.marks ?? []).find((m) => m.type === 'link');
      if (link && typeof link.attrs?.href === 'string') text = `[${text}](${link.attrs.href})`;
      return text;
    })
    .join('');
}

function listItems(items: DocNode[], ordered: boolean, resolve: ResolveMention): string {
  return items
    .map((item, i) => {
      const text = (item.content ?? []).map((c) => inline(c.content, resolve)).join(' ');
      return `${ordered ? `${i + 1}.` : '-'} ${text}`;
    })
    .join('\n');
}

function block(node: DocNode, resolve: ResolveMention): string {
  switch (node.type) {
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
      return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${inline(node.content, resolve)}`;
    }
    case 'paragraph':
      return inline(node.content, resolve);
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => block(child, resolve))
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'bulletList':
      return listItems(node.content ?? [], false, resolve);
    case 'orderedList':
      return listItems(node.content ?? [], true, resolve);
    default:
      return '';
  }
}

export function docToMarkdown(doc: DocNode, resolve: ResolveMention = () => null): string {
  return (doc.content ?? [])
    .map((n) => block(n, resolve))
    .filter((s) => s !== '')
    .join('\n\n');
}
