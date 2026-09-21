import { uuidSchema } from '@/lib/worlds/schemas';

export type GraphParams = {
  center: string | null;
  depth: number;
  label: string | null;
  category: string | null;
  mentions: boolean;
};

export const DEFAULT_GRAPH: GraphParams = {
  center: null,
  depth: 2,
  label: null,
  category: null,
  mentions: true,
};

/** Numero massimo di nodi disegnati (la funzione SQL lo porta comunque a 500). */
export const GRAPH_MAX_NODES = 300;

type Raw = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const clean = (value: string | undefined, max: number) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Parametri del grafo dalla query string: tutto è normalizzato e limitato, mai un errore. */
export function parseGraphParams(raw: Raw): GraphParams {
  const center = uuidSchema.safeParse(clean(first(raw.center), 64));
  const category = uuidSchema.safeParse(clean(first(raw.category), 64));
  const depthText = clean(first(raw.depth), 8);
  const depth = /^-?\d+$/.test(depthText)
    ? Math.min(4, Math.max(0, Number(depthText)))
    : DEFAULT_GRAPH.depth;
  const label = clean(first(raw.label), 120);
  return {
    center: center.success ? center.data : null,
    depth,
    label: label || null,
    category: category.success ? category.data : null,
    mentions: first(raw.mentions) !== '0',
  };
}

/** Query string con i soli parametri diversi dai valori predefiniti. */
export function graphQuery(p: GraphParams): string {
  const qs = new URLSearchParams();
  if (p.center) qs.set('center', p.center);
  if (p.depth !== DEFAULT_GRAPH.depth) qs.set('depth', String(p.depth));
  if (p.label) qs.set('label', p.label);
  if (p.category) qs.set('category', p.category);
  if (!p.mentions) qs.set('mentions', '0');
  return qs.toString();
}

/** Configurazione salvata in una vista (jsonb, scrivibile anche da chi usa l'API): stessi limiti della query string. */
export function parseGraphConfig(input: unknown): GraphParams {
  const c =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return parseGraphParams({
    center: text(c.center),
    depth: typeof c.depth === 'number' ? String(Math.trunc(c.depth)) : text(c.depth),
    label: text(c.label),
    category: text(c.category),
    mentions: c.mentions === false ? '0' : undefined,
  });
}
