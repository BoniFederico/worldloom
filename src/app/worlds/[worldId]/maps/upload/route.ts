import { originAllowed, readImageUpload, storeImage } from '@/lib/images/upload';
import { parseMapForm } from '@/lib/maps/input';
import { loadWorld } from '@/lib/worlds/context';

// Risposta di reindirizzamento con un indirizzo relativo: dietro un proxy `request.url` può avere l'host interno.
const see = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

const ERRORS: Record<string, string> = {
  forbidden: 'forbidden',
  invalid: 'upload_invalid',
  too_large: 'upload_too_large',
  unsupported: 'upload_unsupported',
};

/**
 * Nuova mappa da un modulo (funziona anche senza JavaScript): nome, luogo raffigurato (facoltativo) e immagine.
 * Solo owner ed editor. Il tipo dell'immagine si decide dai byte, come per le immagini degli snippet (D-016).
 */
export async function POST(request: Request, { params }: { params: Promise<{ worldId: string }> }) {
  const { worldId } = await params;
  const back = `/worlds/${worldId}/maps`;
  if (!originAllowed(request)) return see(`${back}?error=forbidden`);

  const { supabase, canWrite } = await loadWorld(worldId);
  if (!canWrite) return see(`${back}?error=forbidden`);

  const upload = await readImageUpload(request);
  if ('error' in upload) return see(`${back}?error=${ERRORS[upload.error] ?? 'generic'}`);

  const parsed = parseMapForm((name) => {
    const value = upload.form.get(name);
    return typeof value === 'string' ? value : undefined;
  });
  if (!parsed.ok) return see(`${back}?error=${parsed.error}`);

  const image = await storeImage(supabase, worldId, upload.bytes, upload.kind);
  if (!image) return see(`${back}?error=generic`);

  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('maps')
    .insert({
      world_id: worldId,
      name: parsed.value.name,
      image,
      snippet_id: parsed.value.place,
      created_by: auth.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    return see(`${back}?error=${error?.code === '23503' ? 'invalid_place' : 'generic'}`);
  }
  return see(`${back}/${data.id}?notice=created`);
}
