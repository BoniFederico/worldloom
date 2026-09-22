import type { createClient } from '@/lib/supabase/server';
import { isTemporalAnomaly, type ValidTime } from './check';

type Client = Awaited<ReturnType<typeof createClient>>;

/** Limite di righe lette per controllo: un mondo con migliaia di snippet (prova di carico, #22) resta comunque
 * utilizzabile; oltre il limite il report segnala che è parziale invece di provare a leggere tutto. */
const MAX_ROWS = 5000;

export type RelationFinding = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  targetId: string;
  targetTitle: string;
  label: string;
};

export type OrphanFinding = { id: string; title: string };

export type CoherenceReport = {
  missingInverse: RelationFinding[];
  temporal: RelationFinding[];
  orphans: OrphanFinding[];
  truncated: boolean;
};

type RelationRow = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  inverse_label: string | null;
  valid_from: ValidTime | null;
  valid_to: ValidTime | null;
  from_mention: boolean;
};

/**
 * Controllo di coerenza (#41): relazioni senza etichetta inversa, intervalli di validità invertiti (D-041: solo
 * quello confrontabile nello schema generico, non "eventi dopo la morte" — l'app non conosce il significato dei
 * campi), snippet senza nessuna relazione. Gira con la sessione di chi guarda: la RLS decide cosa vede, come per
 * ogni altra pagina di sola lettura (grafo, ricerca).
 */
export async function loadCoherenceReport(
  supabase: Client,
  worldId: string,
): Promise<CoherenceReport> {
  const [{ data: relations }, { data: snippets }] = await Promise.all([
    supabase
      .from('relations')
      .select('id, source_id, target_id, label, inverse_label, valid_from, valid_to, from_mention')
      .eq('world_id', worldId)
      .limit(MAX_ROWS),
    supabase
      .from('snippets')
      .select('id, title')
      .eq('world_id', worldId)
      .is('deleted_at', null)
      .limit(MAX_ROWS),
  ]);
  const rels = (relations ?? []) as RelationRow[];
  const snips = snippets ?? [];
  const truncated = rels.length >= MAX_ROWS || snips.length >= MAX_ROWS;
  const titleOf = new Map(snips.map((s) => [s.id, s.title]));

  // Una relazione verso uno snippet cestinato (o non più leggibile) non ha un titolo da mostrare: si esclude
  // invece di segnalare un'anomalia su qualcosa che sta già per sparire.
  const visible = rels.filter((r) => titleOf.has(r.source_id) && titleOf.has(r.target_id));
  const toFinding = (r: RelationRow): RelationFinding => ({
    id: r.id,
    sourceId: r.source_id,
    sourceTitle: titleOf.get(r.source_id) ?? '',
    targetId: r.target_id,
    targetTitle: titleOf.get(r.target_id) ?? '',
    label: r.label,
  });

  const missingInverse = visible.filter((r) => !r.from_mention && !r.inverse_label).map(toFinding);
  const temporal = visible
    .filter((r) => isTemporalAnomaly(r.valid_from, r.valid_to))
    .map(toFinding);

  const linked = new Set<string>();
  for (const r of rels) {
    linked.add(r.source_id);
    linked.add(r.target_id);
  }
  const orphans: OrphanFinding[] = snips
    .filter((s) => !linked.has(s.id))
    .map((s) => ({ id: s.id, title: s.title }));

  return { missingInverse, temporal, orphans, truncated };
}
