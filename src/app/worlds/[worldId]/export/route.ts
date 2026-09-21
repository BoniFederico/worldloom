import { NextResponse } from 'next/server';
import { fileNameOf } from '@/lib/export/filename';
import { loadRawWorld } from '@/lib/export/load';
import { buildExport } from '@/lib/export/world';
import { loadWorld } from '@/lib/worlds/context';

/**
 * Esportazione del mondo in JSON. I dati si leggono con la sessione dell'utente: la RLS decide cosa vede,
 * quindi chi non può leggere un elemento non lo trova nell'export (nessun filtro solo lato client).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { supabase, world } = await loadWorld(worldId);
  const raw = await loadRawWorld(supabase, worldId);
  if (!raw) return NextResponse.json({ error: 'generic' }, { status: 500 });

  const body = JSON.stringify(buildExport(raw), null, 2);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileNameOf(world.name)}.worldloom.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
