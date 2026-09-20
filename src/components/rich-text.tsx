import type { ReactNode } from 'react';
import { sanitizeBody, type DocNode } from '@/lib/snippets/body';

/**
 * Mostra un corpo rich text. Il documento viene sanificato di nuovo (chi scrive può salvare `body` anche via API)
 * e reso come elementi React: nessun `innerHTML`.
 */
export function RichText({ doc }: { doc: unknown }) {
  const clean = sanitizeBody(doc);
  return <div className="prose">{(clean.content ?? []).map((n, i) => block(n, i))}</div>;
}

function inline(nodes: DocNode[] = []): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'hardBreak') return <br key={i} />;
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

function block(node: DocNode, key: number): ReactNode {
  const children = () => (node.content ?? []).map((n, i) => block(n, i));
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{inline(node.content)}</p>;
    case 'heading': {
      // Il titolo dello snippet è l'h1 della pagina: i titoli del testo partono da h2.
      const level = Math.min(4, Number(node.attrs?.level ?? 1) + 1);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      return <Tag key={key}>{inline(node.content)}</Tag>;
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
