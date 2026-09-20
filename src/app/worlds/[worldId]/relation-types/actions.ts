'use server';

import { redirect } from 'next/navigation';
import { parseRelationType } from '@/lib/relations/types';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const path = (world: string) => `/worlds/${world}/relation-types`;
const getter = (formData: FormData) => (name: string) => {
  const value = formData.get(name);
  return value === null ? undefined : String(value);
};

function worldOf(formData: FormData): string {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  return world.data;
}

function dbError(error: { code?: string }): string {
  if (error.code === '23505') return 'duplicate';
  if (error.code === '23503') return 'invalid_category';
  return 'generic';
}

export async function createRelationType(formData: FormData) {
  const world = worldOf(formData);
  const parsed = parseRelationType(getter(formData));
  if (!parsed.ok) redirect(`${path(world)}?error=${parsed.error}`);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { value } = parsed;
  const { error } = await supabase.from('relation_types').insert({
    world_id: world,
    label: value.label,
    inverse_label: value.inverse,
    source_category_id: value.source,
    target_category_id: value.target,
  });
  if (error) redirect(`${path(world)}?error=${dbError(error)}`);
  redirect(`${path(world)}?notice=created`);
}

export async function updateRelationType(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(path(world));
  const parsed = parseRelationType(getter(formData));
  if (!parsed.ok) redirect(`${path(world)}?error=${parsed.error}`);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { value } = parsed;
  const { data, error } = await supabase
    .from('relation_types')
    .update({
      label: value.label,
      inverse_label: value.inverse,
      source_category_id: value.source,
      target_category_id: value.target,
    })
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error) redirect(`${path(world)}?error=${dbError(error)}`);
  if (!data?.length) redirect(`${path(world)}?error=generic`);
  redirect(`${path(world)}?notice=saved`);
}

export async function deleteRelationType(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(path(world));
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { data, error } = await supabase
    .from('relation_types')
    .delete()
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${path(world)}?error=generic`);
  redirect(`${path(world)}?notice=deleted`);
}
