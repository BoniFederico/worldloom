'use server';

import { redirect } from 'next/navigation';
import { parseCalendarForm } from '@/lib/calendars/input';
import type { Json } from '@/lib/supabase/database.types';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const path = (world: string) => `/worlds/${world}/calendars`;
const getter = (formData: FormData) => (name: string) => {
  const value = formData.get(name);
  return value === null ? undefined : String(value);
};

function worldOf(formData: FormData): string {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  return world.data;
}

const dbError = (error: { code?: string }) => (error.code === '23505' ? 'duplicate' : 'generic');

export async function createCalendar(formData: FormData) {
  const world = worldOf(formData);
  const parsed = parseCalendarForm(getter(formData));
  if (!parsed.ok) redirect(`${path(world)}?error=${parsed.error}`);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('calendars').insert({
    world_id: world,
    name: parsed.value.name,
    definition: parsed.value.calendar as unknown as Json,
    created_by: auth.user?.id ?? null,
  });
  if (error) redirect(`${path(world)}?error=${dbError(error)}`);
  redirect(`${path(world)}?notice=created`);
}

export async function updateCalendar(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(path(world));
  const parsed = parseCalendarForm(getter(formData));
  if (!parsed.ok) redirect(`${path(world)}?error=${parsed.error}`);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { data, error } = await supabase
    .from('calendars')
    .update({ name: parsed.value.name, definition: parsed.value.calendar as unknown as Json })
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error) redirect(`${path(world)}?error=${dbError(error)}`);
  if (!data?.length) redirect(`${path(world)}?error=generic`);
  redirect(`${path(world)}?notice=saved`);
}

export async function deleteCalendar(formData: FormData) {
  const world = worldOf(formData);
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(path(world));
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${path(world)}?error=forbidden`);
  const { data, error } = await supabase
    .from('calendars')
    .delete()
    .eq('id', id.data)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${path(world)}?error=generic`);
  redirect(`${path(world)}?notice=deleted`);
}
