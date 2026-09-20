/**
 * Corpo rich text degli snippet: un documento JSON in formato ProseMirror (lo stesso dell'editor).
 * Non si salva mai HTML: ogni scrittura passa da `sanitizeBody`, che ricostruisce il documento con una
 * allowlist di nodi, marcature e attributi. Quello che non è ammesso viene scartato (il testo resta).
 */

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};

export const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };

const MAX_BYTES = 500_000;
const MAX_DEPTH = 12;

type Kind = 'blocks' | 'inline' | 'items';
const NODES: Record<string, Kind> = {
  doc: 'blocks',
  paragraph: 'inline',
  heading: 'inline',
  blockquote: 'blocks',
  bulletList: 'items',
  orderedList: 'items',
  listItem: 'blocks',
};
const MARKS = new Set(['bold', 'italic', 'code', 'link']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Link ammessi: http(s), mailto o percorsi relativi al sito. Niente `javascript:`, `data:` o `//host`. */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 2000) return false;
  const value = href.trim();
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return false;
  return /^(https?:|mailto:)/i.test(value) || (value.startsWith('/') && !value.startsWith('//'));
}

function cleanMarks(raw: unknown): DocMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks: DocMark[] = [];
  for (const mark of raw) {
    if (!isRecord(mark) || typeof mark.type !== 'string' || !MARKS.has(mark.type)) continue;
    if (marks.some((m) => m.type === mark.type)) continue;
    if (mark.type === 'link') {
      const href = isRecord(mark.attrs) ? mark.attrs.href : undefined;
      if (isSafeHref(href)) marks.push({ type: 'link', attrs: { href: href.trim() } });
    } else {
      marks.push({ type: mark.type });
    }
  }
  return marks.length ? marks : undefined;
}

const isInline = (node: DocNode) => node.type === 'text' || node.type === 'hardBreak';

/** Porta i figli al modello di contenuto del genitore (blocchi, inline o voci di lista). */
function normalize(kind: Kind, children: DocNode[]): DocNode[] {
  if (kind === 'inline') {
    return children.flatMap((child) =>
      isInline(child) ? [child] : normalize('inline', child.content ?? []),
    );
  }
  if (kind === 'items') {
    const items: DocNode[] = [];
    let loose: DocNode[] = [];
    const flush = () => {
      if (loose.length) items.push({ type: 'listItem', content: normalize('blocks', loose) });
      loose = [];
    };
    for (const child of children) {
      if (child.type === 'listItem') {
        flush();
        items.push(child);
      } else loose.push(child);
    }
    flush();
    return items;
  }
  const blocks: DocNode[] = [];
  let run: DocNode[] = [];
  const flush = () => {
    if (run.length) blocks.push({ type: 'paragraph', content: run });
    run = [];
  };
  for (const child of children) {
    if (isInline(child)) run.push(child);
    else {
      flush();
      blocks.push(child);
    }
  }
  flush();
  return blocks;
}

function clean(raw: unknown, depth: number): DocNode[] {
  if (!isRecord(raw) || typeof raw.type !== 'string' || depth > MAX_DEPTH) return [];

  if (raw.type === 'text') {
    if (typeof raw.text !== 'string' || raw.text === '') return [];
    const marks = cleanMarks(raw.marks);
    return [marks ? { type: 'text', text: raw.text, marks } : { type: 'text', text: raw.text }];
  }
  if (raw.type === 'hardBreak') return [{ type: 'hardBreak' }];

  const children = Array.isArray(raw.content)
    ? raw.content.flatMap((c) => clean(c, depth + 1))
    : [];
  const kind = NODES[raw.type];
  // Nodo sconosciuto: si scarta il contenitore ma si conserva il contenuto.
  if (!kind || raw.type === 'doc') return children;

  const node: DocNode = { type: raw.type };
  if (raw.type === 'heading') {
    const level = isRecord(raw.attrs) ? Number(raw.attrs.level) : 1;
    node.attrs = { level: Number.isInteger(level) ? Math.min(3, Math.max(1, level)) : 1 };
  }
  if (raw.type === 'orderedList') {
    const start = isRecord(raw.attrs) ? Number(raw.attrs.start) : 1;
    if (Number.isInteger(start) && start > 1 && start < 1_000_000) node.attrs = { start };
  }
  const content = normalize(kind, children);
  if (content.length) node.content = content;
  return [node];
}

/** Ricostruisce il documento con la sola allowlist. Input non valido o troppo grande → documento vuoto. */
export function sanitizeBody(raw: unknown): DocNode {
  if (!isRecord(raw) || raw.type !== 'doc') return EMPTY_DOC;
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return EMPTY_DOC;
  }
  if (size > MAX_BYTES) return EMPTY_DOC;
  const blocks = normalize('blocks', clean(raw, 0));
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
}

/** Testo semplice → documento: la riga vuota separa i paragrafi, l'a capo diventa `hardBreak`. Niente HTML. */
export function textToDoc(input: string): DocNode {
  const paragraphs = input
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return EMPTY_DOC;
  const content = paragraphs.map((chunk): DocNode => {
    const inline: DocNode[] = [];
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) inline.push({ type: 'hardBreak' });
      if (line) inline.push({ type: 'text', text: line });
    });
    return { type: 'paragraph', content: inline };
  });
  return sanitizeBody({ type: 'doc', content });
}

function inlineText(nodes: DocNode[] = []): string {
  return nodes
    .map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? inlineText(n.content))))
    .join('');
}

function blockText(node: DocNode): string {
  if (node.type === 'paragraph' || node.type === 'heading') return inlineText(node.content);
  return (node.content ?? []).map(blockText).filter(Boolean).join('\n\n');
}

/** Testo semplice del documento (per il campo di testo senza JavaScript, per gli estratti e la ricerca). */
export function docToText(doc: unknown): string {
  const clean = sanitizeBody(doc);
  return (clean.content ?? []).map(blockText).filter(Boolean).join('\n\n');
}
