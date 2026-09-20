import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from './schemas';

export type WorldRole = 'owner' | 'editor' | 'commenter' | 'reader';

/** Carica mondo e ruolo dell'utente; per chi non ne fa parte (o id non valido) la pagina non esiste. */
export async function loadWorld(worldId: string) {
  if (!uuidSchema.safeParse(worldId).success) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: world }, { data: membership }] = await Promise.all([
    supabase.from('worlds').select('id, name').eq('id', worldId).maybeSingle(),
    supabase
      .from('world_members')
      .select('role')
      .eq('world_id', worldId)
      .eq('user_id', auth.user?.id ?? '')
      .maybeSingle(),
  ]);
  if (!world || !membership) notFound();
  const role = membership.role as WorldRole;
  return { supabase, world, role, canWrite: role === 'owner' || role === 'editor' };
}
