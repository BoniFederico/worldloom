import { IMAGE_FILE, mimeOfFile } from '@/lib/images/sniff';
import { loadWorld } from '@/lib/worlds/context';

const BUCKET = 'world-images';

/**
 * Serve un'immagine del mondo ai soli membri (e, per chi non scrive, solo se è usata da un elemento che può vedere). Il bucket è privato: la lettura passa dalla sessione dell'utente
 * (RLS su `storage.objects`), quindi un estraneo riceve 404 come per qualunque altra pagina del mondo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ worldId: string; file: string }> },
) {
  const { worldId, file } = await params;
  const mime = mimeOfFile(file);
  if (!IMAGE_FILE.test(file) || !mime) return new Response('Not found', { status: 404 });

  const { supabase, canWrite } = await loadWorld(worldId);
  // Chi non scrive vede un'immagine solo se è usata da qualcosa che può leggere (mappa, testo o campo di uno snippet visibile):
  // un file usato solo da uno snippet segreto risponde 404 come se non esistesse.
  if (!canWrite) {
    const { data: allowed } = await supabase.rpc('can_read_image', {
      p_world: worldId,
      p_file: file,
    });
    if (!allowed) return new Response('Not found', { status: 404 });
  }
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
