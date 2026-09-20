'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { categoryInputSchema } from '@/lib/categories/catalog';
import { PRESETS, buildPreset } from '@/lib/categories/presets';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (worldId: string) => `/worlds/${worldId}/categories`;

function worldOf(formData: FormData): string {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  return world.data;
}

export async function createCategory(formData: FormData) {
  const world = worldOf(formData);
  const input = categoryInputSchema.safeParse({
    name: field(formData, 'name'),
    icon: field(formData, 'icon'),
    color: field(formData, 'color'),
  });
  if (!input.success) redirect(`${listPath(world)}?error=invalid_input`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .insert({ world_id: world, ...input.data })
    .select('id')
    .single();
  // La RLS ammette solo owner ed editor: per gli altri l'inserimento fallisce.
  if (error || !data) redirect(`${listPath(world)}?error=generic`);
  redirect(`${listPath(world)}/${data.id}?notice=created`);
}

export async function importPresets(formData: FormData) {
  const world = worldOf(formData);
  const wanted = new Set(formData.getAll('preset').map(String));
  const chosen = PRESETS.filter((p) => wanted.has(p.id));
  if (chosen.length === 0) redirect(`${listPath(world)}?error=nothing_selected`);

  const t = await getTranslations('Presets');
  const supabase = await createClient();
  // Un preset già importato (stesso nome) non si duplica.
  const { data: existing } = await supabase.from('categories').select('name').eq('world_id', world);
  const taken = new Set((existing ?? []).map((c) => c.name));
  const rows = chosen.flatMap((preset) => {
    const built = buildPreset(preset, { text: (key) => t(key) });
    if (taken.has(built.name)) return [];
    return [
      {
        world_id: world,
        name: built.name,
        icon: built.icon,
        color: built.color,
        fields_schema: built.fields as unknown as Json,
      },
    ];
  });
  if (rows.length === 0) redirect(`${listPath(world)}?error=already_imported`);

  const { error } = await supabase.from('categories').insert(rows);
  if (error) redirect(`${listPath(world)}?error=generic`);
  redirect(`${listPath(world)}?notice=imported`);
}

export async function updateCategory(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(listPath(world));
  const back = `${listPath(world)}/${id.data}`;
  const input = categoryInputSchema.safeParse({
    name: field(formData, 'name'),
    icon: field(formData, 'icon'),
    color: field(formData, 'color'),
  });
  if (!input.success) redirect(`${back}?error=invalid_input`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .update(input.data)
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=saved`);
}

export async function deleteCategory(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(listPath(world));
  if (field(formData, 'confirm') !== 'on') {
    redirect(`${listPath(world)}/${id.data}?error=confirm_required`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${listPath(world)}/${id.data}?error=generic`);
  redirect(`${listPath(world)}?notice=deleted`);
}
