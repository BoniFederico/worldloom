import { fieldsSchema } from '@/lib/fields/fields';
import { loadRestricted, withRestricted } from '@/lib/visibility/restricted';
import type { createClient } from '@/lib/supabase/server';
import type { SearchParams } from '@/lib/search/params';
import type { TableContext, TableRow } from './table';

type Client = Awaited<ReturnType<typeof createClient>>;

export const TABLE_LIMIT = 500;
const BASE_SELECT =
  'id, title, status, tags, fields, updated_at, snippet_categories(category_id)' as const;

/** Tipi di campo che hanno senso come colonna o come filtro di testo. */
const FILTERABLE_FIELD_TYPES = new Set(['text', 'number', 'date', 'choice']);

export type FieldColumn = { key: string; label: string; type: string; filterable: boolean };

/** Categorie e campi del mondo: servono a nominare le colonne e a leggere i valori. */
export async function loadTableContext(
  supabase: Client,
  worldId: string,
): Promise<{
  ctx: TableContext;
  categories: { id: string; name: string }[];
  fieldColumns: FieldColumn[];
}> {
  const { data } = await supabase
    .from('categories')
    .select('id, name, fields_schema')
    .eq('world_id', worldId)
    .order('name');
  const categories = (data ?? []).map((c) => ({ id: c.id, name: c.name }));
  const fields = new Map<string, { label: string; type: string }>();
  for (const c of data ?? []) {
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const f of parsed.data)
      if (!fields.has(f.key)) fields.set(f.key, { label: f.label, type: f.type });
  }
  return {
    ctx: { categories: new Map(categories.map((c) => [c.id, c.name])), fields },
    categories,
    fieldColumns: [...fields].map(([key, f]) => ({
      key,
      label: f.label,
      type: f.type,
      filterable: FILTERABLE_FIELD_TYPES.has(f.type),
    })),
  };
}

/** Caratteri speciali di `ilike` resi letterali: il filtro sui campi è un'uguaglianza senza badare alle maiuscole. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Righe della tabella con i permessi di chi guarda (RLS). Filtri: categoria, tag, stato, valore di un campo e archivio.
 * Legge al massimo `TABLE_LIMIT` righe; `truncated` dice se ce ne sono altre.
 */
export async function loadTableRows(
  supabase: Client,
  worldId: string,
  p: SearchParams,
): Promise<{ rows: TableRow[]; truncated: boolean } | null> {
  // Il filtro per categoria usa un secondo incorporamento (alias) così `category_ids` resta completo; il tipo è quello base.
  const select = (
    p.category
      ? `${BASE_SELECT}, category_filter:snippet_categories!inner(category_id)`
      : BASE_SELECT
  ) as typeof BASE_SELECT;
  let query = supabase
    .from('snippets')
    .select(select)
    .eq('world_id', worldId)
    .is('deleted_at', null);
  if (!p.archived) query = query.is('archived_at', null);
  if (p.category) query = query.eq('category_filter.category_id', p.category);
  if (p.tags.length) query = query.contains('tags', p.tags);
  if (p.status) query = query.eq('status', p.status);
  if (p.fieldKey) query = query.filter(`fields->>${p.fieldKey}`, 'ilike', escapeLike(p.fieldValue));

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(TABLE_LIMIT + 1);
  if (error || !data) return null;
  // I campi riservati non stanno nella colonna pubblica: chi li può leggere li vede uniti agli altri.
  const restricted = await loadRestricted(supabase, worldId);
  const rows = data.slice(0, TABLE_LIMIT).map((s): TableRow => ({
    id: s.id,
    title: s.title,
    status: s.status,
    tags: s.tags,
    updated_at: s.updated_at,
    category_ids: s.snippet_categories.map((c) => c.category_id),
    fields: withRestricted(
      s.id,
      typeof s.fields === 'object' && s.fields !== null && !Array.isArray(s.fields)
        ? (s.fields as Record<string, unknown>)
        : {},
      restricted,
    ),
  }));
  return { rows, truncated: data.length > TABLE_LIMIT };
}
