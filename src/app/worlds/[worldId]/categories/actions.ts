'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { categoryInputSchema } from '@/lib/categories/catalog';
import { PRESETS, buildPreset } from '@/lib/categories/presets';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { addField, fieldFromInput, moveField, removeField, updateField } from '@/lib/fields/edit';
import { fieldsSchema, type FieldDefinition } from '@/lib/fields/fields';
import { loadWorld } from '@/lib/worlds/context';
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

type Mutation = (defs: FieldDefinition[]) => FieldDefinition[];

/** Il campo indicato non esiste più (ad esempio rimosso da un'altra scheda aperta). */
class MissingFieldError extends Error {}

function requireField(defs: FieldDefinition[], key: string) {
  if (!defs.some((d) => d.key === key)) throw new MissingFieldError(key);
}

/**
 * Legge i campi della categoria, applica `mutate` e salva. Il salvataggio è condizionato a `updated_at`:
 * se un altro editor ha modificato la categoria nel frattempo l'operazione non sovrascrive nulla.
 */
async function mutateFields(formData: FormData, mutate: Mutation, notice: string): Promise<never> {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(listPath(world));
  const back = `${listPath(world)}/${id.data}`;

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);

  const { data: row } = await supabase
    .from('categories')
    .select('fields_schema, updated_at')
    .eq('id', id.data)
    .eq('world_id', world)
    .maybeSingle();
  const current = fieldsSchema.safeParse(row?.fields_schema);
  if (!row || !current.success) redirect(`${back}?error=generic`);

  let next: FieldDefinition[];
  try {
    next = mutate(current.data);
  } catch (e) {
    redirect(`${back}?error=${e instanceof MissingFieldError ? 'field_missing' : 'invalid_field'}`);
  }

  const { data, error } = await supabase
    .from('categories')
    .update({ fields_schema: next as unknown as Json })
    .eq('id', id.data)
    .eq('updated_at', row.updated_at)
    .select('id');
  if (error) redirect(`${back}?error=generic`);
  if (!data?.length) redirect(`${back}?error=conflict`);
  redirect(`${back}?notice=${notice}`);
}

const text = (formData: FormData, name: string): string | undefined => {
  const value = formData.get(name);
  return value === null ? undefined : String(value);
};

export async function addFieldAction(formData: FormData) {
  const input = {
    label: text(formData, 'label'),
    type: text(formData, 'type'),
    required: text(formData, 'required'),
    options: text(formData, 'options'),
    min: text(formData, 'min'),
    max: text(formData, 'max'),
  };
  return mutateFields(
    formData,
    (defs) => {
      const parsed = fieldFromInput(
        input,
        defs.map((d) => d.key),
      );
      if (!parsed.ok) throw new Error('invalid');
      return addField(defs, parsed.field);
    },
    'field_added',
  );
}

export async function updateFieldAction(formData: FormData) {
  const key = field(formData, 'key');
  return mutateFields(
    formData,
    (defs) => {
      const def = defs.find((d) => d.key === key);
      if (!def) return defs;
      // Il tipo non cambia: si ricostruisce il campo con lo stesso tipo e si prendono solo i vincoli ammessi.
      const parsed = fieldFromInput(
        {
          label: text(formData, 'label'),
          type: def.type,
          required: text(formData, 'required'),
          options: text(formData, 'options'),
          min: text(formData, 'min'),
          max: text(formData, 'max'),
        },
        [],
      );
      if (!parsed.ok) throw new Error('invalid');
      return updateField(defs, key, {
        label: parsed.field.label,
        required: parsed.field.required,
        options: parsed.field.options,
        min: parsed.field.min,
        max: parsed.field.max,
      });
    },
    'field_saved',
  );
}

export async function removeFieldAction(formData: FormData) {
  const key = field(formData, 'key');
  return mutateFields(
    formData,
    (defs) => {
      requireField(defs, key);
      return removeField(defs, key);
    },
    'field_removed',
  );
}

export async function moveFieldAction(formData: FormData) {
  const key = field(formData, 'key');
  const direction = field(formData, 'direction') === 'up' ? 'up' : 'down';
  return mutateFields(
    formData,
    (defs) => {
      requireField(defs, key);
      return moveField(defs, key, direction);
    },
    'field_moved',
  );
}
