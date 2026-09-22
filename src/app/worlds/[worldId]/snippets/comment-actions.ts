'use server';

import { redirect } from 'next/navigation';
import { commentSchema } from '@/lib/comments/input';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const snippetPath = (world: string, id: string) => `/worlds/${world}/snippets/${id}`;

/** Un commento lo scrive chiunque sia membro del mondo e veda lo snippet (anche un lettore, non solo chi scrive). */
export async function createComment(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const snippet = uuidSchema.safeParse(field(formData, 'snippet'));
  if (!world.success || !snippet.success) redirect('/worlds');
  const back = snippetPath(world.data, snippet.data);
  const { supabase } = await loadWorld(world.data);
  const parsed = commentSchema.safeParse(field(formData, 'body'));
  if (!parsed.success) redirect(`${back}?error=comment_invalid_input#comments`);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { error } = await supabase.from('snippet_comments').insert({
    world_id: world.data,
    snippet_id: snippet.data,
    author: auth.user.id,
    body: parsed.data,
  });
  redirect(`${back}?${error ? 'error=comment_failed' : 'notice=comment_posted'}#comments`);
}

export async function deleteComment(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const snippet = uuidSchema.safeParse(field(formData, 'snippet'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!world.success || !snippet.success || !id.success) redirect('/worlds');
  const back = snippetPath(world.data, snippet.data);
  const { supabase } = await loadWorld(world.data);
  const { data, error } = await supabase
    .from('snippet_comments')
    .delete()
    .eq('id', id.data)
    .select('id');
  redirect(
    `${back}?${error || !data?.length ? 'error=comment_failed' : 'notice=comment_deleted'}#comments`,
  );
}
