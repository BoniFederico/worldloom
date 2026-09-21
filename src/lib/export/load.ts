import type { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import type { RawWorld } from './world';

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000;

/** PostgREST restituisce al massimo 1000 righe per richiesta: si legge a pagine finché ce ne sono. */
async function all<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/**
 * Legge il mondo con la sessione di chi esporta: la RLS decide cosa si vede, quindi l'export contiene solo
 * ciò che l'utente può già leggere (mai segreti a chi non ne ha diritto). `null` se una lettura fallisce.
 */
export async function loadRawWorld(supabase: Client, worldId: string): Promise<RawWorld | null> {
  const { data: world } = await supabase
    .from('worlds')
    .select('name')
    .eq('id', worldId)
    .maybeSingle();
  if (!world) return null;

  const [categories, snippets, types, relations] = await Promise.all([
    all((f, t) =>
      supabase
        .from('categories')
        .select('id, name, icon, color, fields_schema, content_template')
        .eq('world_id', worldId)
        .order('id')
        .range(f, t),
    ),
    all((f, t) =>
      supabase
        .from('snippets')
        .select(
          'id, title, status, visibility, archived_at, deleted_at, tags, aliases, fields, body, created_at, snippet_categories(category_id)',
        )
        .eq('world_id', worldId)
        .is('deleted_at', null)
        .order('id')
        .range(f, t),
    ),
    all((f, t) =>
      supabase
        .from('relation_types')
        .select('label, inverse_label, source_category_id, target_category_id')
        .eq('world_id', worldId)
        .order('id')
        .range(f, t),
    ),
    all((f, t) =>
      supabase
        .from('relations')
        .select(
          'source_id, target_id, label, inverse_label, notes, valid_from, valid_to, from_mention, visibility, created_at',
        )
        .eq('world_id', worldId)
        .order('id')
        .range(f, t),
    ),
  ]);
  if (!categories || !snippets || !types || !relations) return null;

  return {
    world,
    categories,
    snippets: snippets.map(({ snippet_categories, ...s }) => ({
      ...s,
      category_ids: snippet_categories.map((c) => c.category_id),
    })),
    relationTypes: types,
    relations: relations.map((r) => ({
      ...r,
      valid_from: r.valid_from as Json,
      valid_to: r.valid_to as Json,
    })),
  };
}
