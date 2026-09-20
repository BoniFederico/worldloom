'use server';

import { parseSearchParams, rpcArgs } from '@/lib/search/params';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

export type QuickResult = { id: string; title: string; excerpt: string };
export type QuickSearchResponse = { ok: true; results: QuickResult[] } | { ok: false };

/**
 * Ricerca per il comando rapido (Ctrl/Cmd+K). Passa dalla stessa funzione SQL della pagina di ricerca, con i permessi di chi
 * chiama: la visibilità la decide la RLS, non questo codice. Un mondo non valido dà un elenco vuoto; un errore è distinto
 * da «nessun risultato».
 */
export async function quickSearch(input: {
  world: string;
  query: string;
}): Promise<QuickSearchResponse> {
  const world = uuidSchema.safeParse(input.world);
  if (!world.success || typeof input.query !== 'string') return { ok: true, results: [] };
  const params = parseSearchParams({ q: input.query });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_snippets', rpcArgs(world.data, params, 8));
  if (error || !data) return { ok: false };
  return {
    ok: true,
    results: data.map((row) => ({ id: row.id, title: row.title, excerpt: row.excerpt })),
  };
}
