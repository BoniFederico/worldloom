import type { createClient } from '@/lib/supabase/server';
import { buildForest, flip, type Edge, type Forest } from './build';
import type { TreeParams } from './params';

type Client = Awaited<ReturnType<typeof createClient>>;

export const TREE_EDGE_LIMIT = 5000;
const TITLE_LIMIT = 10_000;

/** Caratteri speciali di `ilike` resi letterali: l'etichetta si confronta per uguaglianza senza badare alle maiuscole. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');

export type TreeData = {
  forest: Forest;
  /** Titolo scelto come radice che non corrisponde a nessuno snippet leggibile. */
  rootMissing: boolean;
  /** Le relazioni con quell'etichetta sono più del tetto letto. */
  edgesTruncated: boolean;
};

/**
 * Albero (o foresta) di una relazione scelta dall'utente, con i permessi di chi guarda (RLS). Una relazione «A padre di B»
 * dà A → B; se è registrata come «B figlio di A» con inversa «padre di» vale lo stesso, quindi l'etichetta si cerca sia
 * come etichetta sia come inversa. Le relazioni nate da menzioni sono escluse. `null` se la lettura fallisce.
 */
export async function loadTree(
  supabase: Client,
  worldId: string,
  p: TreeParams,
): Promise<TreeData | null> {
  const empty: TreeData = {
    forest: { roots: [], count: 0, edgeCount: 0, hasCycle: false, truncated: false },
    rootMissing: false,
    edgesTruncated: false,
  };
  if (!p.label) return empty;

  const pattern = escapeLike(p.label);
  const base = () =>
    supabase
      .from('relations')
      .select('source_id, target_id')
      .eq('world_id', worldId)
      .eq('from_mention', false);
  const [direct, inverse] = await Promise.all([
    base().ilike('label', pattern).order('id').limit(TREE_EDGE_LIMIT),
    base().ilike('inverse_label', pattern).order('id').limit(TREE_EDGE_LIMIT),
  ]);
  if (direct.error || inverse.error) return null;

  const edges: Edge[] = [
    ...(direct.data ?? []).map((r) => ({ parent: r.source_id, child: r.target_id })),
    ...(inverse.data ?? []).map((r) => ({ parent: r.target_id, child: r.source_id })),
  ];
  const edgesTruncated =
    (direct.data?.length ?? 0) >= TREE_EDGE_LIMIT || (inverse.data?.length ?? 0) >= TREE_EDGE_LIMIT;
  if (!edges.length) return { ...empty, rootMissing: false };

  const { data: rows, error } = await supabase
    .from('snippets')
    .select('id, title')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .order('id')
    .limit(TITLE_LIMIT);
  if (error) return null;
  const titles = new Map((rows ?? []).map((s) => [s.id, s.title]));

  let root: string | null = null;
  if (p.root) {
    const wanted = p.root.toLocaleLowerCase('it');
    root = [...titles].find(([, title]) => title.toLocaleLowerCase('it') === wanted)?.[0] ?? null;
    if (!root) return { ...empty, rootMissing: true, edgesTruncated };
  }
  const forest = buildForest(titles, p.dir === 'up' ? flip(edges) : edges, { root });
  return { forest, rootMissing: false, edgesTruncated };
}
