'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** Segna una notifica come letta. La RLS limita comunque la scrittura alle proprie. */
export async function markNotificationRead(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect('/notifications');
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id.data);
  redirect('/notifications');
}

/** Segna tutte le notifiche non lette come lette. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  redirect('/notifications');
}
