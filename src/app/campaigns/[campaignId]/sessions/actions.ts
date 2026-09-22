'use server';

import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { notesSchema, postSchema, sessionSchema, type PostKind } from '@/lib/sessions/input';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (campaign: string) => `/campaigns/${campaign}/sessions`;

export async function createSession(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  const { supabase, canManage, userId } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const parsed = sessionSchema.safeParse({
    title: field(formData, 'title'),
    playedOn: field(formData, 'played_on'),
    summary: field(formData, 'summary'),
  });
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const { data, error } = await supabase
    .from('campaign_sessions')
    // `number` è assegnato da un trigger prima dell'inserimento (mai dal client, che non ha il permesso di scriverlo):
    // il tipo generato lo vede come obbligatorio, ma la riga risultante lo ha sempre.
    .insert({
      campaign_id: campaign.data,
      title: parsed.data.title,
      played_on: parsed.data.playedOn,
      summary: parsed.data.summary,
      created_by: userId,
    } as never)
    .select('id')
    .single();
  if (error || !data) redirect(`${back}?error=failed`);
  redirect(`${back}/${data.id}?notice=created`);
}

export async function updateSession(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !id.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${id.data}`;
  const { supabase, canManage } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const parsed = sessionSchema.safeParse({
    title: field(formData, 'title'),
    playedOn: field(formData, 'played_on'),
    summary: field(formData, 'summary'),
  });
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const { error } = await supabase
    .from('campaign_sessions')
    .update({
      title: parsed.data.title,
      played_on: parsed.data.playedOn,
      summary: parsed.data.summary,
    })
    .eq('id', id.data);
  if (error) redirect(`${back}?error=failed`);
  redirect(`${back}?notice=saved`);
}

export async function deleteSession(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !id.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  if (field(formData, 'confirm') !== 'yes') redirect(`${back}/${id.data}?error=confirm_required`);
  const { supabase } = await loadCampaign(campaign.data);
  const { data, error } = await supabase
    .from('campaign_sessions')
    .delete()
    .eq('id', id.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}/${id.data}?error=failed`);
  redirect(`${back}?notice=deleted`);
}

/** Note del DM: solo chi gestisce. Upsert: la riga esiste al più una per sessione. */
export async function saveDmNotes(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const session = uuidSchema.safeParse(field(formData, 'session'));
  if (!campaign.success || !session.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${session.data}`;
  const { supabase, canManage } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const parsed = notesSchema.safeParse(field(formData, 'notes'));
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const { error } = await supabase
    .from('session_dm_notes')
    .upsert({ session_id: session.data, notes: parsed.data });
  redirect(`${back}?${error ? 'error=failed' : 'notice=notes_saved'}`);
}

/** Note del giocatore: solo lui, mai lette da altri. Upsert per (sessione, utente). */
export async function savePlayerNotes(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const session = uuidSchema.safeParse(field(formData, 'session'));
  if (!campaign.success || !session.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${session.data}`;
  const { supabase, userId, role } = await loadCampaign(campaign.data);
  if (role === 'observer') redirect(`${back}?error=forbidden`);
  const parsed = notesSchema.safeParse(field(formData, 'notes'));
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const { error } = await supabase
    .from('session_player_notes')
    .upsert({ session_id: session.data, user_id: userId, notes: parsed.data });
  redirect(`${back}?${error ? 'error=failed' : 'notice=notes_saved'}`);
}

/** Collega uno snippet del mondo della campagna come evento di timeline, cercato per titolo esatto (senza badare alle maiuscole). */
export async function linkSessionSnippet(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const session = uuidSchema.safeParse(field(formData, 'session'));
  if (!campaign.success || !session.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${session.data}`;
  const { supabase, canManage, campaign: c } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const title = field(formData, 'title').trim();
  if (!title || !c.world_id) redirect(`${back}?error=event_not_found`);
  const { data: matches } = await supabase
    .from('snippets')
    .select('id')
    .eq('world_id', c.world_id)
    .is('deleted_at', null)
    .ilike('title', title)
    .limit(2);
  if (!matches || matches.length !== 1) redirect(`${back}?error=event_not_found`);
  const { error } = await supabase
    .from('session_snippets')
    .insert({ session_id: session.data, snippet_id: matches[0]!.id });
  redirect(`${back}?${error ? 'error=event_link_failed' : 'notice=event_linked'}`);
}

export async function unlinkSessionSnippet(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const session = uuidSchema.safeParse(field(formData, 'session'));
  const snippet = uuidSchema.safeParse(field(formData, 'snippet'));
  if (!campaign.success || !session.success || !snippet.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${session.data}`;
  const { supabase } = await loadCampaign(campaign.data);
  await supabase
    .from('session_snippets')
    .delete()
    .eq('session_id', session.data)
    .eq('snippet_id', snippet.data);
  redirect(`${back}?notice=event_unlinked`);
}

/** Voce di diario (`chronicle`) o di bacheca (`message`): stessa azione, la sezione decide dove tornare. */
export async function createPost(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const kind = field(formData, 'kind');
  if (!campaign.success || (kind !== 'chronicle' && kind !== 'message')) redirect('/campaigns');
  const back = `/campaigns/${campaign.data}/${kind === 'chronicle' ? 'chronicle' : 'messages'}`;
  const { supabase, role, userId } = await loadCampaign(campaign.data);
  if (role === 'observer') redirect(`${back}?error=forbidden`);
  const parsed = postSchema.safeParse(field(formData, 'body'));
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const { error } = await supabase.from('campaign_posts').insert({
    campaign_id: campaign.data,
    kind: kind as PostKind,
    author: userId,
    body: parsed.data,
  });
  redirect(`${back}?${error ? 'error=failed' : 'notice=posted'}`);
}

export async function deletePost(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  const kind = field(formData, 'kind');
  if (!campaign.success || !id.success || (kind !== 'chronicle' && kind !== 'message')) {
    redirect('/campaigns');
  }
  const back = `/campaigns/${campaign.data}/${kind === 'chronicle' ? 'chronicle' : 'messages'}`;
  const { supabase } = await loadCampaign(campaign.data);
  const { data, error } = await supabase
    .from('campaign_posts')
    .delete()
    .eq('id', id.data)
    .select('id');
  redirect(`${back}?${error || !data?.length ? 'error=failed' : 'notice=deleted'}`);
}
