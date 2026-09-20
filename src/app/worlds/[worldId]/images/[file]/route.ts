import { IMAGE_FILE, mimeOfFile } from '@/lib/images/sniff';
import { loadWorld } from '@/lib/worlds/context';

const BUCKET = 'world-images';

/**
 * Serve un'immagine del mondo ai soli membri. Il bucket è privato: la lettura passa dalla sessione dell'utente
 * (RLS su `storage.objects`), quindi un estraneo riceve 404 come per qualunque altra pagina del mondo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ worldId: string; file: string }> },
) {
  const { worldId, file } = await params;
  const mime = mimeOfFile(file);
  if (!IMAGE_FILE.test(file) || !mime) return new Response('Not found', { status: 404 });

  const { supabase } = await loadWorld(worldId);
  const { data, error } = await supabase.storage.from(BUCKET).download(`${worldId}/${file}`);
  if (error || !data) {
    // Assente o non leggibile → 404; un guasto di Storage non si spaccia per «non trovato».
    const missing = /not.?found|does not exist|object/i.test(error?.message ?? '');
    return new Response(missing ? 'Not found' : 'Storage error', { status: missing ? 404 : 502 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      // Anche se un file fosse interpretato come documento, non può eseguire nulla.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
