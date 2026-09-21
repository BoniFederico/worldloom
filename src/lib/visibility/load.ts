import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type ShareTarget = { id: string; name: string };

/** Membri con cui si può condividere: chi non scrive nel mondo (giocatori), con il loro nome. Solo per chi scrive. */
export async function loadShareTargets(supabase: Client, worldId: string): Promise<ShareTarget[]> {
  const { data: members } = await supabase
    .from('world_members')
    .select('user_id, role')
    .eq('world_id', worldId)
    .in('role', ['reader', 'commenter']);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return ids
    .map((id) => ({ id, name: names.get(id) || id.slice(0, 8) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/** Destinatari attuali per elemento (chiave: `kind:item[:campo]`). Solo per chi scrive (la RLS mostra solo le proprie agli altri). */
export async function loadShares(
  supabase: Client,
  worldId: string,
  kind: 'snippet' | 'relation' | 'pin' | 'field',
  itemIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (itemIds.length === 0) return out;
  const { data } = await supabase
    .from('visibility_shares')
    .select('item_id, field_key, user_id')
    .eq('world_id', worldId)
    .eq('kind', kind)
    .in('item_id', itemIds);
  for (const s of data ?? []) {
    const key = s.field_key ? `${s.item_id}:${s.field_key}` : s.item_id;
    out.set(key, [...(out.get(key) ?? []), s.user_id]);
  }
  return out;
}
