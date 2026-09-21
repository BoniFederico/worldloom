'use server';

import { redirect } from 'next/navigation';
import { parseSearchParams } from '@/lib/search/params';
import type { Json } from '@/lib/supabase/database.types';
import { filtersOf, viewNameSchema } from '@/lib/views/filters';
import { configFromQuery } from '@/lib/views/table';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const viewsPath = (world: string) => `/worlds/${world}/views`;

const rawOf = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));

function worldOf(formData: FormData): string {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  return world.data;
}

function viewOf(formData: FormData, world: string): string {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(viewsPath(world));
  return id.data;
}

/** Salva i criteri della ricerca come vista (elenco). Solo chi può scrivere; la RLS lo garantisce anche a livello dati. */
export async function saveView(formData: FormData) {
  const world = worldOf(formData);
  const params = parseSearchParams(rawOf(formData));
  const kind = field(formData, 'kind') === 'table' ? 'table' : 'list';
  const back = `/worlds/${world}/${kind === 'table' ? 'table' : 'search'}`;
  const name = viewNameSchema.safeParse(field(formData, 'name'));
  if (!name.success) redirect(`${back}?error=invalid_view_name`);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data, error } = await supabase
    .from('saved_views')
    .insert({
      world_id: world,
      name: name.data,
      kind,
      filters: filtersOf(params) as Json,
      config: (kind === 'table' ? configFromQuery(rawOf(formData)) : {}) as unknown as Json,
      shared: formData.get('shared') === 'on',
      created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error || !data) redirect(`${back}?error=view_failed`);
  redirect(`${viewsPath(world)}/${data.id}?notice=created`);
}

export async function updateView(formData: FormData) {
  const world = worldOf(formData);
  const id = viewOf(formData, world);
  const page = `${viewsPath(world)}/${id}`;
  const name = viewNameSchema.safeParse(field(formData, 'name'));
  if (!name.success) redirect(`${page}?error=invalid_name`);
  const { supabase } = await loadWorld(world);
  const { data: auth } = await supabase.auth.getUser();
  const { data: current } = await supabase
    .from('saved_views')
    .select('created_by')
    .eq('id', id)
    .eq('world_id', world)
    .maybeSingle();
  if (!current) redirect(`${page}?error=forbidden`);
  // La condivisione la decide solo chi ha creato la vista: il proprietario può rinominare quella di un altro, ma non
  // renderla privata (non la vedrebbe più, e la RLS rifiuterebbe l'aggiornamento).
  const isCreator = current.created_by === auth.user?.id;
  // La RLS limita l'aggiornamento a chi l'ha creata e al proprietario: se non può, nessuna riga cambia.
  const { data, error } = await supabase
    .from('saved_views')
    .update(
      isCreator
        ? { name: name.data, shared: formData.get('shared') === 'on' }
        : { name: name.data },
    )
    .eq('id', id)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${page}?error=forbidden`);
  redirect(`${page}?notice=updated`);
}

export async function deleteView(formData: FormData) {
  const world = worldOf(formData);
  const id = viewOf(formData, world);
  const page = `${viewsPath(world)}/${id}`;
  if (field(formData, 'confirm') !== 'on') redirect(`${page}?error=confirm_required`);
  const { supabase } = await loadWorld(world);
  const { data, error } = await supabase
    .from('saved_views')
    .delete()
    .eq('id', id)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${page}?error=forbidden`);
  redirect(`${viewsPath(world)}?notice=deleted`);
}
