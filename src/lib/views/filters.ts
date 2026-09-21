import { z } from 'zod';
import { parseSearchParams, type SearchParams } from '@/lib/search/params';

/** Tipi di visualizzazione (gli stessi del vincolo `saved_views_kind_check`). */
export const VIEW_KINDS = ['list', 'table', 'graph', 'timeline', 'map', 'tree', 'kanban'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export const viewNameSchema = z.string().trim().min(1).max(80);

/** Filtri salvati con la vista: gli stessi criteri della ricerca, solo quelli impostati. */
export type ViewFilters = {
  q?: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'final';
  field?: string;
  value?: string;
  relation?: string;
  archived?: true;
};

export function filtersOf(p: SearchParams): ViewFilters {
  const filters: ViewFilters = {};
  if (p.q) filters.q = p.q;
  if (p.category) filters.category = p.category;
  if (p.tags.length) filters.tags = p.tags;
  if (p.status) filters.status = p.status;
  if (p.fieldKey) {
    filters.field = p.fieldKey;
    if (p.fieldValue) filters.value = p.fieldValue;
  }
  if (p.relation) filters.relation = p.relation;
  if (p.archived) filters.archived = true;
  return filters;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/**
 * Parametri di ricerca da filtri letti dal database. Il jsonb può contenere qualsiasi cosa (lo scrive anche chi usa
 * l'API): ogni valore passa dallo stesso parsing e dagli stessi limiti della query string, quindi non c'è errore possibile.
 */
export function paramsOfFilters(input: unknown): SearchParams {
  const f = isRecord(input) ? input : {};
  const tags = Array.isArray(f.tags)
    ? f.tags.filter((t): t is string => typeof t === 'string' && !/[,{}"\\]/.test(t)).join(',')
    : undefined;
  return parseSearchParams({
    q: text(f.q),
    category: text(f.category),
    tags,
    status: text(f.status),
    field: text(f.field),
    value: text(f.value),
    relation: text(f.relation),
    archived: f.archived === true ? '1' : undefined,
  });
}

/** Query string della pagina di ricerca con i criteri impostati (per aprire o modificare i filtri di una vista). */
export function searchQuery(p: SearchParams): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.category) qs.set('category', p.category);
  if (p.tags.length) qs.set('tags', p.tags.join(','));
  if (p.status) qs.set('status', p.status);
  if (p.fieldKey) {
    qs.set('field', p.fieldKey);
    if (p.fieldValue) qs.set('value', p.fieldValue);
  }
  if (p.relation) qs.set('relation', p.relation);
  if (p.archived) qs.set('archived', '1');
  return qs.toString();
}
