import { NextResponse } from 'next/server';
import { imageSrc } from '@/lib/images/sniff';
import { originAllowed, readImageUpload, storeImage } from '@/lib/images/upload';
import { loadWorld } from '@/lib/worlds/context';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Caricamento di un'immagine del mondo (solo owner ed editor). Il tipo si decide dai byte del file, mai dal
 * nome o dal Content-Type dichiarati; il file è salvato con un nome casuale e un'estensione scelta da noi.
 */
export async function POST(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  if (!originAllowed(request)) return fail('forbidden', 403);

  const { worldId } = await params;
  const { supabase, canWrite } = await loadWorld(worldId);
  if (!canWrite) return fail('forbidden', 403);

  const upload = await readImageUpload(request);
  if ('error' in upload) return fail(upload.error, upload.status);

  const name = await storeImage(supabase, worldId, upload.bytes, upload.kind);
  if (!name) return fail('generic', 500);
  return NextResponse.json({ src: imageSrc(worldId, name) });
}
