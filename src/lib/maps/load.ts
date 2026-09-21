import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export const MAP_PIN_LIMIT = 500;

export type MapSummary = { id: string; name: string; image: string; placeId: string | null };
export type MapPin = {
  id: string;
  snippetId: string;
  title: string;
  x: number;
  y: number;
  categoryIds: string[];
  visibility: 'secret' | 'shared' | 'members' | 'public';
  /** La mappa che raffigura questo luogo, se esiste: un clic sul pin la apre. */
  placeMap: { id: string; name: string } | null;
};
export type MapRoute = { id: string; name: string; stops: string[] };

export type MapDetail = {
  map: MapSummary;
  /** Snippet-luogo raffigurato dalla mappa (titolo), se c'è e si può leggere. */
  place: { id: string; title: string } | null;
  pins: MapPin[];
  routes: MapRoute[];
  truncated: boolean;
};

/** Mappe del mondo, con il titolo del luogo raffigurato (con i permessi di chi legge). */
export async function loadMaps(
  supabase: Client,
  worldId: string,
): Promise<{ maps: (MapSummary & { placeTitle: string | null })[] } | null> {
  const { data, error } = await supabase
    .from('maps')
    .select('id, name, image, snippet_id')
    .eq('world_id', worldId)
    .order('name');
  if (error) return null;
  const placeIds = [...new Set((data ?? []).flatMap((m) => (m.snippet_id ? [m.snippet_id] : [])))];
  const { data: places } = placeIds.length
    ? await supabase.from('snippets').select('id, title').in('id', placeIds).is('deleted_at', null)
    : { data: [] };
  const titles = new Map((places ?? []).map((p) => [p.id, p.title]));
  return {
    maps: (data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      image: m.image,
      placeId: m.snippet_id,
      placeTitle: m.snippet_id ? (titles.get(m.snippet_id) ?? null) : null,
    })),
  };
}

/**
 * Una mappa con i suoi pin e percorsi. I pin dei luoghi che chi legge non può vedere non arrivano (RLS sui pin e sugli
 * snippet); gli snippet nel cestino non compaiono. `null` se la mappa non esiste o la lettura fallisce.
 */
export async function loadMapDetail(
  supabase: Client,
  worldId: string,
  mapId: string,
): Promise<MapDetail | null | 'missing'> {
  const { data: map, error } = await supabase
    .from('maps')
    .select('id, name, image, snippet_id')
    .eq('id', mapId)
    .eq('world_id', worldId)
    .maybeSingle();
  if (error) return null;
  if (!map) return 'missing';

  const [pinsResult, routesResult, placeResult] = await Promise.all([
    supabase
      .from('map_pins')
      .select(
        'id, snippet_id, x, y, visibility, snippets!inner(title, deleted_at, snippet_categories(category_id))',
      )
      .eq('map_id', mapId)
      .is('snippets.deleted_at', null)
      .order('created_at')
      .limit(MAP_PIN_LIMIT + 1),
    supabase.from('map_routes').select('id, name, stops').eq('map_id', mapId).order('created_at'),
    map.snippet_id
      ? supabase
          .from('snippets')
          .select('id, title')
          .eq('id', map.snippet_id)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (pinsResult.error || routesResult.error) return null;

  const rows = pinsResult.data ?? [];
  const pinRows = rows.slice(0, MAP_PIN_LIMIT);
  const snippetIds = pinRows.map((p) => p.snippet_id);
  // Mappe dei luoghi con un pin qui: il pin apre quella mappa (la prima in ordine di nome).
  const { data: placeMaps } = snippetIds.length
    ? await supabase
        .from('maps')
        .select('id, name, snippet_id')
        .eq('world_id', worldId)
        .in('snippet_id', snippetIds)
        .neq('id', mapId)
        .order('name')
    : { data: [] };
  const placeMapOf = new Map<string, { id: string; name: string }>();
  for (const m of placeMaps ?? []) {
    if (m.snippet_id && !placeMapOf.has(m.snippet_id)) {
      placeMapOf.set(m.snippet_id, { id: m.id, name: m.name });
    }
  }

  return {
    map: { id: map.id, name: map.name, image: map.image, placeId: map.snippet_id },
    place: placeResult.data ? { id: placeResult.data.id, title: placeResult.data.title } : null,
    pins: pinRows.map((p) => ({
      id: p.id,
      snippetId: p.snippet_id,
      title: p.snippets.title,
      x: p.x,
      y: p.y,
      categoryIds: p.snippets.snippet_categories.map((c) => c.category_id),
      visibility: p.visibility,
      placeMap: placeMapOf.get(p.snippet_id) ?? null,
    })),
    routes: (routesResult.data ?? []).map((r) => ({ id: r.id, name: r.name, stops: r.stops })),
    truncated: rows.length > MAP_PIN_LIMIT,
  };
}
