'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { emailSchema } from '@/lib/auth/schemas';
import { assignableRoleSchema, uuidSchema, worldNameSchema } from '@/lib/worlds/schemas';

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

const membersPath = (worldId: string) => `/worlds/${worldId}/members`;

export async function addMember(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  const back = membersPath(world.data);
  const email = emailSchema.safeParse(field(formData, 'email'));
  const role = assignableRoleSchema.safeParse(field(formData, 'role'));
  if (!email.success || !role.success) redirect(`${back}?error=invalid_input`);

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_world_member', {
    p_world: world.data,
    p_email: email.data,
    p_role: role.data,
  });
  if (error?.message.includes('user_not_found')) redirect(`${back}?error=user_not_found`);
  if (error?.message.includes('already_owner')) redirect(`${back}?error=already_owner`);
  if (error) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=member_saved`);
}

export async function changeMemberRole(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const user = uuidSchema.safeParse(field(formData, 'user'));
  if (!world.success || !user.success) redirect('/worlds');
  const back = membersPath(world.data);
  const role = assignableRoleSchema.safeParse(field(formData, 'role'));
  if (!role.success) redirect(`${back}?error=invalid_input`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('world_members')
    .update({ role: role.data })
    .eq('world_id', world.data)
    .eq('user_id', user.data)
    .select('user_id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=member_saved`);
}

export async function removeMember(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const user = uuidSchema.safeParse(field(formData, 'user'));
  if (!world.success || !user.success) redirect('/worlds');
  const back = membersPath(world.data);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('world_members')
    .delete()
    .eq('world_id', world.data)
    .eq('user_id', user.data)
    .select('user_id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=member_removed`);
}

export async function leaveWorld(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('world_members')
    .delete()
    .eq('world_id', world.data)
    .eq('user_id', auth.user?.id ?? '')
    .select('user_id');
  // Il proprietario non può uscire: la RLS non cancella la sua riga e deve prima trasferire la proprietà.
  if (error || !data?.length) redirect(`${membersPath(world.data)}?error=owner_cannot_leave`);
  redirect('/worlds?notice=left');
}

export async function transferOwnership(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const user = uuidSchema.safeParse(field(formData, 'user'));
  if (!world.success) redirect('/worlds');
  const back = membersPath(world.data);
  if (!user.success) redirect(`${back}?error=invalid_input`);
  if (field(formData, 'confirm') !== 'on') redirect(`${back}?error=confirm_required`);

  const supabase = await createClient();
  const { error } = await supabase.rpc('transfer_world_ownership', {
    p_world: world.data,
    p_new_owner: user.data,
  });
  if (error) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=ownership_transferred`);
}
