'use server';

import { redirect } from 'next/navigation';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** Ripristina il contenuto di una versione; la cronologia lo registra come nuova versione. */
export async function restoreVersion(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(`/worlds/${world.data}/snippets`);
  const snippetPath = `/worlds/${world.data}/snippets/${id.data}`;
  const history = `${snippetPath}/history`;
  const version = Number(field(formData, 'version'));
  const token = field(formData, 'token');
  if (!Number.isInteger(version) || version < 1 || !token) redirect(`${history}?error=generic`);

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) redirect(`${history}?error=forbidden`);
  const { error } = await supabase.rpc('restore_snippet_version', {
    p_snippet: id.data,
    p_version: version,
    p_updated: token,
  });
  if (error) {
    const known = ['conflict', 'not_found'];
    redirect(`${history}?error=${known.includes(error.message) ? error.message : 'generic'}`);
  }
  redirect(`${snippetPath}?notice=version_restored`);
}
