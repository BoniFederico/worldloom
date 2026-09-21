import { fieldsSchema, type FieldDefinition } from '@/lib/fields/fields';
import type { createClient } from '@/lib/supabase/server';
import { buildBoard, type Board, type Card } from './build';
import type { KanbanParams } from './params';

type Client = Awaited<ReturnType<typeof createClient>>;

export const KANBAN_LIMIT = 500;
export const STATUS_OPTIONS = ['draft', 'final'];

export type ChoiceField = { key: string; label: string; options: string[]; categoryIds: string[] };

/** Campi a scelta delle categorie del mondo; lo stesso campo in più categorie unisce le opzioni, nell'ordine di comparsa. */
export async function loadChoiceFields(
  supabase: Client,
  worldId: string,
): Promise<{ fields: ChoiceField[]; categories: { id: string; name: string }[] } | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, fields_schema')
    .eq('world_id', worldId)
    .order('name');
  if (error || !data) return null;
  const fields = new Map<string, ChoiceField>();
  for (const c of data) {
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const f of parsed.data) {
      // «status» è riservato alla colonna dello stato.
      if (f.type !== 'choice' || !f.options || f.key === 'status') continue;
      const known = fields.get(f.key);
      if (known) {
        known.categoryIds.push(c.id);
        for (const o of f.options) if (!known.options.includes(o)) known.options.push(o);
      } else {
        fields.set(f.key, {
          key: f.key,
          label: f.label,
          options: [...f.options],
          categoryIds: [c.id],
        });
      }
    }
  }
  return {
    fields: [...fields.values()],
    categories: data.map((c) => ({ id: c.id, name: c.name })),
  };
}

export type BoardData = {
  board: Board;
  options: string[];
  /** Ci sono più snippet del tetto letto. */
  truncated: boolean;
};

/**
 * Bacheca per stato o per un campo a scelta, con i permessi di chi guarda (RLS). Per un campo entrano solo gli snippet di
 * una categoria che lo definisce. `null` se la lettura fallisce o il campo non esiste.
 */
export async function loadBoard(
  supabase: Client,
  worldId: string,
  p: KanbanParams,
  choice: ChoiceField[],
): Promise<BoardData | null> {
  if (!p.by) return null;
  const field = p.by === 'status' ? null : choice.find((f) => f.key === p.by);
  if (p.by !== 'status' && !field) return null;

  const scope = field
    ? p.category
      ? field.categoryIds.filter((id) => id === p.category)
      : field.categoryIds
    : p.category
      ? [p.category]
      : null;
  if (scope && scope.length === 0) {
    return {
      board: buildBoard([], field?.options ?? STATUS_OPTIONS),
      options: field?.options ?? STATUS_OPTIONS,
      truncated: false,
    };
  }

  let query = supabase
    .from('snippets')
    .select(
      scope
        ? 'id, title, status, fields, updated_at, snippet_categories!inner(category_id)'
        : 'id, title, status, fields, updated_at',
    )
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .is('archived_at', null);
  if (scope) query = query.in('snippet_categories.category_id', scope);
  const { data, error } = await query
    .order('title')
    .order('id')
    .limit(KANBAN_LIMIT + 1);
  if (error || !data) return null;

  const rows = data as unknown as {
    id: string;
    title: string;
    status: string;
    fields: unknown;
    updated_at: string;
  }[];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const s of rows.slice(0, KANBAN_LIMIT)) {
    if (seen.has(s.id)) continue; // uno snippet in più categorie del campo compare una volta sola
    seen.add(s.id);
    const fields =
      typeof s.fields === 'object' && s.fields !== null && !Array.isArray(s.fields)
        ? (s.fields as Record<string, unknown>)
        : {};
    const raw = field ? fields[field.key] : s.status;
    cards.push({
      id: s.id,
      title: s.title,
      value: typeof raw === 'string' && raw ? raw : null,
      updated: s.updated_at,
    });
  }
  const options = field?.options ?? STATUS_OPTIONS;
  return { board: buildBoard(cards, options), options, truncated: rows.length > KANBAN_LIMIT };
}

/** Definizioni dei campi delle categorie di uno snippet (per validare uno spostamento); lo stesso campo in più categorie resta ripetuto. */
export async function loadSnippetDefs(
  supabase: Client,
  worldId: string,
  snippetId: string,
): Promise<FieldDefinition[] | null> {
  const { data, error } = await supabase
    .from('snippet_categories')
    .select('categories!inner(world_id, fields_schema)')
    .eq('snippet_id', snippetId)
    .eq('categories.world_id', worldId);
  if (error || !data) return null;
  const defs: FieldDefinition[] = [];
  for (const row of data as unknown as { categories: { fields_schema: unknown } }[]) {
    const parsed = fieldsSchema.safeParse(row.categories.fields_schema);
    if (!parsed.success) continue;
    defs.push(...parsed.data);
  }
  return defs;
}
