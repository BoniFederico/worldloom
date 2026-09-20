'use server';

import { parseSearchParams, rpcArgs } from '@/lib/search/params';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

export type QuickResult = { id: string; title: string; excerpt: string };

/**
 * Ricerca per il comando rapido (Ctrl/Cmd+K). Passa dalla stessa funzione SQL della pagina di ricerca, con i permessi di chi
 * chiama: la visibilità la decide la RLS, non questo codice. Un errore o un mondo non valido danno un elenco vuoto.
 */
export async function quickSearch(input: { world: string; query: string }): Promise<QuickResult[]> {
  const world = uuidSchema.safeParse(input.world);
  if (!world.success || typeof input.query !== 'string') return [];
  const params = parseSearchParams({ q: input.query });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_snippets', rpcArgs(world.data, params, 8));
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, title: row.title, excerpt: row.excerpt }));
}
