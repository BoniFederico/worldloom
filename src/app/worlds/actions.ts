'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema, worldNameSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export async function createWorld(formData: FormData) {
  const name = worldNameSchema.safeParse(field(formData, 'name'));
  if (!name.success) redirect('/worlds?error=invalid_input');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login?next=%2Fworlds');

  const { data, error } = await supabase
    .from('worlds')
    .insert({ name: name.data, owner_id: auth.user.id })
    .select('id')
    .single();
  if (error || !data) redirect('/worlds?error=generic');
  redirect(`/worlds/${data.id}`);
}

export async function renameWorld(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  const name = worldNameSchema.safeParse(field(formData, 'name'));
  if (!id.success) redirect('/worlds');
  const back = `/worlds/${id.data}/settings`;
  if (!name.success) redirect(`${back}?error=invalid_input`);

  const supabase = await createClient();
  // La RLS limita l'aggiornamento al proprietario: se non lo è, nessuna riga cambia.
  const { data, error } = await supabase
    .from('worlds')
    .update({ name: name.data })
    .eq('id', id.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=renamed`);
}

export async function deleteWorld(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect('/worlds');
  if (field(formData, 'confirm') !== 'on') {
    redirect(`/worlds/${id.data}/settings?error=confirm_required`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from('worlds').delete().eq('id', id.data).select('id');
  if (error || !data?.length) redirect(`/worlds/${id.data}/settings?error=generic`);
  redirect('/worlds?notice=deleted');
}
