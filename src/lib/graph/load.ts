import type { createClient } from '@/lib/supabase/server';
import { GRAPH_MAX_NODES, type GraphParams } from './params';

type Client = Awaited<ReturnType<typeof createClient>>;

export type GraphNode = { id: string; title: string; category_ids: string[]; degree: number };
export type GraphEdge = {
  source: string;
  target: string;
  label: string;
  inverse_label: string | null;
  from_mention: boolean;
};
export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  edgesTruncated: boolean;
};

// I parametri opzionali della funzione SQL si passano come null (i tipi generati non li dichiarano nullable).
const nullable = (value: string | null) => value as string;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Grafo del mondo con i permessi di chi guarda (la funzione SQL gira con la sua sessione: RLS). `null` se la lettura fallisce. */
export async function loadGraph(
  supabase: Client,
  worldId: string,
  p: GraphParams,
): Promise<GraphData | null> {
  const { data, error } = await supabase.rpc('graph_data', {
    p_world: worldId,
    p_center: nullable(p.center),
    p_depth: p.depth,
    p_label: nullable(p.label),
    p_category: nullable(p.category),
    p_mentions: p.mentions,
    p_max_nodes: GRAPH_MAX_NODES,
  });
  if (error || !isRecord(data) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    return null;
  }
  return {
    nodes: data.nodes as GraphNode[],
    edges: data.edges as GraphEdge[],
    truncated: data.truncated === true,
    edgesTruncated: data.edges_truncated === true,
  };
}
