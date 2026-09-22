import Link from 'next/link';
import type { ReactNode } from 'react';
import { sanitizeBody, type DocNode } from '@/lib/snippets/body';

/**
 * Mostra un corpo rich text. Il documento viene sanificato di nuovo (chi scrive può salvare `body` anche via API)
 * e reso come elementi React: nessun `innerHTML`.
 */
type Context = {
  /** Mondo dello snippet: serve a costruire i link delle menzioni. */
  worldId?: string;
  /** Titoli attuali degli snippet menzionati; un id assente è cancellato o non leggibile. */
  titles?: Record<string, string>;
  /** Testo neutro per una menzione che chi guarda non può risolvere. */
  unavailable: string;
  /** Base del link di una menzione (default `/worlds/<worldId>/snippets`); usata dalla wiki pubblica. */
  linkBase?: string;
  /** Base del link di un'immagine (default il file così com'è salvato); usata dalla wiki pubblica. */
  imageBase?: string;
};

export function RichText({
  doc,
  worldId,
  titles,
  unavailable,
  linkBase,
  imageBase,
}: { doc: unknown } & Context) {
  const clean = sanitizeBody(doc);
  const context = { worldId, titles, unavailable, linkBase, imageBase };
  return <div className="prose">{(clean.content ?? []).map((n, i) => block(n, i, context))}</div>;
}

function inline(nodes: DocNode[] = [], context: Context): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />;
    if (node.type === 'mention') {
      // Il titolo si risolve con i permessi di chi guarda: uno snippet non leggibile o cancellato non rivela nulla.
      const id = String(node.attrs?.id ?? '');
      const title = context.titles?.[id];
      if (!context.worldId || title === undefined) {
        return (
          <span key={i} className="mention mention-missing">
            @{context.unavailable}
          </span>
        );
      }
      const base = context.linkBase ?? `/worlds/${context.worldId}/snippets`;
      return (
        <Link key={i} className="mention" href={`${base}/${id}`}>
          @{title}
        </Link>
      );
    }
    let out: ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') out = <strong>{out}</strong>;
      else if (mark.type === 'italic') out = <em>{out}</em>;
      else if (mark.type === 'code') out = <code>{out}</code>;
      else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
        out = (
          <a href={mark.attrs.href} rel="noopener noreferrer nofollow">
            {out}
          </a>
        );
      }
    }
    return <span key={i}>{out}</span>;
  });
}

function block(node: DocNode, key: number, context: Context): ReactNode {
  const children = () => (node.content ?? []).map((n, i) => block(n, i, context));
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{inline(node.content, context)}</p>;
    case 'heading': {
      // Il titolo dello snippet è l'h1 della pagina: i titoli del testo partono da h2.
      const level = Math.min(4, Number(node.attrs?.level ?? 1) + 1);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      return <Tag key={key}>{inline(node.content, context)}</Tag>;
    }
    case 'blockquote':
      return <blockquote key={key}>{children()}</blockquote>;
    case 'bulletList':
      return <ul key={key}>{children()}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={typeof node.attrs?.start === 'number' ? node.attrs.start : undefined}>
          {children()}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children()}</li>;
    case 'image': {
      const original = typeof node.attrs?.src === 'string' ? node.attrs.src : undefined;
      // La wiki pubblica serve le immagini da una rotta diversa (senza autenticazione): stesso file, altra base.
      const src =
        context.imageBase && original
          ? `${context.imageBase}/${original.slice(original.lastIndexOf('/') + 1)}`
          : original;
      return (
        // eslint-disable-next-line @next/next/no-img-element -- immagine privata servita da una rotta autenticata
        <img
          key={key}
          src={src}
          alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''}
          loading="lazy"
        />
      );
    }
    case 'table':
      return (
        <div key={key} className="table-wrap">
          <table>
            <tbody>{children()}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{children()}</tr>;
    case 'tableHeader':
    case 'tableCell': {
      const Tag = node.type === 'tableHeader' ? 'th' : 'td';
      const colSpan = typeof node.attrs?.colspan === 'number' ? node.attrs.colspan : undefined;
      const rowSpan = typeof node.attrs?.rowspan === 'number' ? node.attrs.rowspan : undefined;
      return (
        <Tag key={key} colSpan={colSpan} rowSpan={rowSpan}>
          {children()}
        </Tag>
      );
    }
    default:
      return null;
  }
}
