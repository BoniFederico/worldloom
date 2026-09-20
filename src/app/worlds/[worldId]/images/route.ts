import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES, imageSrc, sniffImage } from '@/lib/images/sniff';
import { loadWorld } from '@/lib/worlds/context';

const BUCKET = 'world-images';
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Caricamento di un'immagine del mondo (solo owner ed editor). Il tipo si decide dai byte del file, mai dal
 * nome o dal Content-Type dichiarati; il file è salvato con un nome casuale e un'estensione scelta da noi.
 */
export async function POST(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  // Difesa in profondità contro richieste da altri siti: l'Origin, se presente, deve essere il nostro.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('forbidden', 403);

  const { worldId } = await params;
  const { supabase, canWrite } = await loadWorld(worldId);
  if (!canWrite) return fail('forbidden', 403);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return fail('too_large', 413);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return fail('invalid', 400);
  }
  if (!(file instanceof File)) return fail('invalid', 400);
  if (file.size > MAX_IMAGE_BYTES) return fail('too_large', 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail('unsupported', 415);

  const name = `${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${worldId}/${name}`, bytes, { contentType: kind.mime, upsert: false });
  if (error) return fail('generic', 500);
  return NextResponse.json({ src: imageSrc(worldId, name) });
}
