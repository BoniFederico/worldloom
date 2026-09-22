import type { createClient } from '@/lib/supabase/server';
import { mentionsOf } from '@/lib/snippets/body';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Al massimo tanti snippet nell'indice della wiki (coerente col limite della ricerca, D-019). */
export const MAX_WIKI_SNIPPETS = 300;

export async function loadWikiWorld(supabase: Supabase, slug: string) {
  const { data } = await supabase
    .from('worlds')
    .select('id, name, wiki_slug')
    .eq('wiki_slug', slug)
    .maybeSingle();
  return data;
}

export async function listWikiSnippets(supabase: Supabase, worldId: string) {
  const { data } = await supabase
    .from('snippets')
    .select('id, title, snippet_categories(category_id)')
    .eq('world_id', worldId)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .order('title')
    .limit(MAX_WIKI_SNIPPETS);
  return data ?? [];
}

export async function loadWikiCategories(supabase: Supabase, worldId: string) {
  const { data } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('world_id', worldId);
  return data ?? [];
}

export async function loadWikiSnippet(supabase: Supabase, worldId: string, snippetId: string) {
  const { data: snippet } = await supabase
    .from('snippets')
    .select('id, title, body, tags')
    .eq('world_id', worldId)
    .eq('id', snippetId)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .maybeSingle();
  if (!snippet) return null;

  const mentioned = mentionsOf(snippet.body);
  const { data: mentionRows } = mentioned.length
    ? await supabase
        .from('snippets')
        .select('id, title')
        .eq('world_id', worldId)
        .eq('visibility', 'public')
        .is('deleted_at', null)
        .in('id', mentioned)
    : { data: [] };
  const titles = Object.fromEntries((mentionRows ?? []).map((m) => [m.id, m.title]));

  const { data: outgoing } = await supabase
    .from('relations')
    .select('id, label, target_id, from_mention')
    .eq('world_id', worldId)
    .eq('source_id', snippetId)
    .eq('visibility', 'public');
  const { data: incoming } = await supabase
    .from('relations')
    .select('id, label, inverse_label, source_id, from_mention')
    .eq('world_id', worldId)
    .eq('target_id', snippetId)
    .eq('visibility', 'public');

  const relatedIds = [
    ...new Set([
      ...(outgoing ?? []).map((r) => r.target_id),
      ...(incoming ?? []).map((r) => r.source_id),
    ]),
  ];
  const { data: relatedRows } = relatedIds.length
    ? await supabase
        .from('snippets')
        .select('id, title')
        .eq('world_id', worldId)
        .eq('visibility', 'public')
        .is('deleted_at', null)
        .in('id', relatedIds)
    : { data: [] };
  const relatedTitles = Object.fromEntries((relatedRows ?? []).map((s) => [s.id, s.title]));

  const relations = [
    ...(outgoing ?? [])
      .filter((r) => !r.from_mention && relatedTitles[r.target_id])
      .map((r) => ({ label: r.label, title: relatedTitles[r.target_id]!, id: r.target_id })),
    ...(incoming ?? [])
      .filter((r) => !r.from_mention && relatedTitles[r.source_id])
      .map((r) => ({
        label: r.inverse_label || r.label,
        title: relatedTitles[r.source_id]!,
        id: r.source_id,
      })),
  ];
  // «Menzionato in»: le relazioni nate da @menzioni, solo in ingresso (D-018).
  const backlinks = (incoming ?? [])
    .filter((r) => r.from_mention && relatedTitles[r.source_id])
    .map((r) => ({ title: relatedTitles[r.source_id]!, id: r.source_id }));

  return { snippet, titles, relations, backlinks };
}
