import { NextResponse } from 'next/server';
import { fileNameOf } from '@/lib/export/filename';
import { loadRawWorld } from '@/lib/export/load';
import { buildExport } from '@/lib/export/world';
import { loadWorld } from '@/lib/worlds/context';

/**
 * Esportazione del mondo in JSON. I dati si leggono con la sessione dell'utente: la RLS decide cosa vede,
 * quindi chi non può leggere un elemento non lo trova nell'export (nessun filtro solo lato client).
 *
 * `?template=1` (#43): esporta solo la struttura — categorie con i loro campi e tipi di relazione — senza
 * snippet né relazioni, così il file può essere condiviso e importato come punto di partenza per un mondo
 * nuovo senza portarsi dietro il contenuto originale. Nessun formato nuovo: è lo stesso JSON v1, con gli
 * array di contenuto vuoti, già accettato dall'import esistente senza modifiche.
 */
export async function GET(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { supabase, world } = await loadWorld(worldId);
  const raw = await loadRawWorld(supabase, worldId);
  if (!raw) return NextResponse.json({ error: 'generic' }, { status: 500 });

  const isTemplate = new URL(request.url).searchParams.get('template') === '1';
  const data = isTemplate ? { ...raw, snippets: [], relations: [] } : raw;
  const suffix = isTemplate ? 'template.worldloom.json' : 'worldloom.json';

  const body = JSON.stringify(buildExport(data), null, 2);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileNameOf(world.name)}.${suffix}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
