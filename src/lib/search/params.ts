import { parseTags } from '@/lib/snippets/labels';
import { uuidSchema } from '@/lib/worlds/schemas';

export type SearchParams = {
  q: string;
  category: string | null;
  tags: string[];
  status: 'draft' | 'final' | null;
  fieldKey: string | null;
  fieldValue: string;
  relation: string | null;
  archived: boolean;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const clean = (value: string | undefined, max: number) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Parametri di ricerca dalla query string. Tutto è normalizzato e limitato: un parametro ripetuto vale come il primo,
 * i valori non validi si scartano (mai un errore 500), i tag seguono le stesse regole di quelli salvati.
 */
export function parseSearchParams(raw: Raw): SearchParams {
  const category = uuidSchema.safeParse(clean(first(raw.category), 64));
  const tags = parseTags(clean(first(raw.tags), 300));
  const status = first(raw.status);
  const fieldKey = clean(first(raw.field), 64);
  const relation = clean(first(raw.relation), 120);
  return {
    q: clean(first(raw.q), 200),
    category: category.success ? category.data : null,
    tags: tags.ok ? tags.values : [],
    status: status === 'draft' || status === 'final' ? status : null,
    fieldKey: /^[a-z0-9_]{1,64}$/.test(fieldKey) ? fieldKey : null,
    fieldValue: clean(first(raw.value), 200),
    relation: relation || null,
    archived: first(raw.archived) === '1',
  };
}

/** Argomenti della funzione SQL `search_snippets`. */
export function rpcArgs(world: string, p: SearchParams, limit: number) {
  return {
    p_world: world,
    p_query: p.q,
    p_category: p.category ?? undefined,
    p_tags: p.tags,
    p_status: p.status ?? undefined,
    p_field_key: p.fieldKey ?? undefined,
    p_field_value: p.fieldKey ? p.fieldValue : undefined,
    p_relation: p.relation ?? undefined,
    p_include_archived: p.archived,
    p_limit: limit,
  };
}

/** Vero se c'è almeno un criterio (testo o filtro). */
export const hasCriteria = (p: SearchParams) =>
  Boolean(p.q || p.category || p.tags.length || p.status || p.fieldKey || p.relation || p.archived);

export type ExcerptPart = { text: string; mark: boolean };

/** Divide l'estratto di `ts_headline` (termini tra `<<` e `>>`) in parti: il testo non è mai interpretato come HTML. */
export function splitExcerpt(excerpt: string): ExcerptPart[] {
  const parts: ExcerptPart[] = [];
  const pattern = /<<(.*?)>>/gs;
  let last = 0;
  for (const match of excerpt.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: excerpt.slice(last, index), mark: false });
    parts.push({ text: match[1] ?? '', mark: true });
    last = index + match[0].length;
  }
  if (last < excerpt.length) parts.push({ text: excerpt.slice(last), mark: false });
  return parts;
}
