import { NextResponse } from 'next/server';
import { fileNameOf } from '@/lib/export/filename';
import { loadRawWorld } from '@/lib/export/load';
import { buildMarkdownBundle } from '@/lib/export/markdown-bundle';
import { loadWorld } from '@/lib/worlds/context';
import { buildZip } from '@/lib/zip/store';

/**
 * Esportazione del mondo in Markdown (#100): un archivio ZIP con un file .md per snippet (front matter più
 * corpo) e `_worldloom.json` (lo stesso export JSON di D-021, che garantisce la fedeltà del round trip).
 * Stessi permessi dell'export JSON: i dati si leggono con la sessione dell'utente, la RLS decide cosa vede.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const { supabase, world } = await loadWorld(worldId);
  const raw = await loadRawWorld(supabase, worldId);
  if (!raw) return NextResponse.json({ error: 'generic' }, { status: 500 });

  const zip = buildZip(buildMarkdownBundle(raw));
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileNameOf(world.name)}.worldloom.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
