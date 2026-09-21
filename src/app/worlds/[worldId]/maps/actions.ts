'use server';

import { redirect } from 'next/navigation';
import { parsePinForm, parseRouteForm } from '@/lib/maps/input';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const getter = (formData: FormData) => (name: string) => {
  const value = formData.get(name);
  return value === null ? undefined : String(value);
};

function ids(formData: FormData): { world: string; map: string } {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  const map = uuidSchema.safeParse(field(formData, 'map'));
  if (!map.success) redirect(`/worlds/${world.data}/maps`);
  return { world: world.data, map: map.data };
}

const mapPath = (world: string, map: string) => `/worlds/${world}/maps/${map}`;

function dbError(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return 'duplicate_pin';
  if (error.code === '23503') return 'invalid_snippet';
  if (error.message?.includes('route_stops_invalid')) return 'invalid_stops';
  return 'generic';
}

export async function addPin(formData: FormData) {
  const { world, map } = ids(formData);
  const back = mapPath(world, map);
  const parsed = parsePinForm(getter(formData));
  if (!parsed.ok) redirect(`${back}?error=${parsed.error}`);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { value } = parsed;
  const { error } = await supabase
    .from('map_pins')
    .insert({ world_id: world, map_id: map, snippet_id: value.snippet, x: value.x, y: value.y });
  if (error) redirect(`${back}?error=${dbError(error)}`);
  redirect(`${back}?notice=pin_added`);
}

export async function removePin(formData: FormData) {
  const { world, map } = ids(formData);
  const back = mapPath(world, map);
  const pin = uuidSchema.safeParse(field(formData, 'pin'));
  if (!pin.success) redirect(back);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data, error } = await supabase
    .from('map_pins')
    .delete()
    .eq('id', pin.data)
    .eq('map_id', map)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=pin_removed`);
}

export async function addRoute(formData: FormData) {
  const { world, map } = ids(formData);
  const back = mapPath(world, map);
  const parsed = parseRouteForm(field(formData, 'name'), formData.getAll('stop').map(String));
  if (!parsed.ok) redirect(`${back}?error=${parsed.error}`);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { error } = await supabase.from('map_routes').insert({
    world_id: world,
    map_id: map,
    name: parsed.value.name,
    stops: parsed.value.stops,
  });
  if (error) redirect(`${back}?error=${dbError(error)}`);
  redirect(`${back}?notice=route_added`);
}

export async function removeRoute(formData: FormData) {
  const { world, map } = ids(formData);
  const back = mapPath(world, map);
  const route = uuidSchema.safeParse(field(formData, 'route'));
  if (!route.success) redirect(back);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data, error } = await supabase
    .from('map_routes')
    .delete()
    .eq('id', route.data)
    .eq('map_id', map)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=route_removed`);
}

export async function deleteMap(formData: FormData) {
  const { world, map } = ids(formData);
  const back = mapPath(world, map);
  if (field(formData, 'confirm') !== 'on') redirect(`${back}?error=confirm_required`);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data, error } = await supabase
    .from('maps')
    .delete()
    .eq('id', map)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`/worlds/${world}/maps?notice=deleted`);
}
