import { readPages } from '@/lib/supabase/pages';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export const RESTRICTED_LIMIT = 5000;

export type Restricted = {
  /** Valori riservati letti, per snippet. Con la RLS di chi legge: il DM li vede tutti, un giocatore solo quelli condivisi con lui. */
  values: Map<string, Record<string, unknown>>;
  /** Livello di ogni valore riservato (solo per chi li può leggere). */
  levels: Map<string, Record<string, 'secret' | 'shared'>>;
};

const EMPTY: Restricted = { values: new Map(), levels: new Map() };

/**
 * Valori dei campi «secret» o «shared» del mondo che chi guarda può leggere. I campi riservati non stanno in `snippets.fields`,
 * quindi ogni vista che li mostra li unisce con `withRestricted`. Un errore di lettura non rivela nulla (mappa vuota).
 */
export async function loadRestricted(supabase: Client, worldId: string): Promise<Restricted> {
  const result = await readPages(
    (from, to) =>
      supabase
        .from('snippet_restricted_fields')
        .select('snippet_id, key, value, visibility')
        .eq('world_id', worldId)
        .order('snippet_id')
        .order('key')
        .range(from, to),
    RESTRICTED_LIMIT,
  );
  if (!result) return EMPTY;
  const values = new Map<string, Record<string, unknown>>();
  const levels = new Map<string, Record<string, 'secret' | 'shared'>>();
  for (const r of result.rows) {
    const v = values.get(r.snippet_id) ?? {};
    // Un valore «null» è un campo riservato senza contenuto: non compare come valore.
    if (r.value !== null) v[r.key] = r.value;
    values.set(r.snippet_id, v);
    const l = levels.get(r.snippet_id) ?? {};
    l[r.key] = r.visibility === 'shared' ? 'shared' : 'secret';
    levels.set(r.snippet_id, l);
  }
  return { values, levels };
}

/** Campi di uno snippet con i valori riservati leggibili da chi guarda. */
export function withRestricted(
  id: string,
  fields: Record<string, unknown>,
  restricted: Restricted,
): Record<string, unknown> {
  const extra = restricted.values.get(id);
  return extra ? { ...fields, ...extra } : fields;
}
