import { IMAGE_FILE, mimeOfFile } from '@/lib/images/sniff';
import { createClient } from '@/lib/supabase/server';
import { loadWikiWorld } from '@/lib/wiki/load';
import { wikiSlugSchema } from '@/lib/wiki/slug';

const BUCKET = 'world-images';

/**
 * Serve un'immagine della wiki pubblica, senza autenticazione: l'autorizzazione la decide la policy di storage
 * `world_images_public_read` (mondo pubblicato + file citato da uno snippet pubblico, D-042), non questo codice.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ worldSlug: string; file: string }> },
) {
  const { worldSlug, file } = await params;
  if (!wikiSlugSchema.safeParse(worldSlug).success)
    return new Response('Not found', { status: 404 });
  const mime = mimeOfFile(file);
  if (!IMAGE_FILE.test(file) || !mime) return new Response('Not found', { status: 404 });

  const supabase = await createClient();
  const world = await loadWikiWorld(supabase, worldSlug);
  if (!world) return new Response('Not found', { status: 404 });

  const { data, error } = await supabase.storage.from(BUCKET).download(`${world.id}/${file}`);
  if (error || !data) {
    const missing = /not.?found|does not exist|object/i.test(error?.message ?? '');
    return new Response(missing ? 'Not found' : 'Storage error', { status: missing ? 404 : 502 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // Davvero pubblica: cache condivisa, non solo del browser.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
