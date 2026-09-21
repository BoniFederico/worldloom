'use server';

import { redirect } from 'next/navigation';
import { campaignSchema, parseInviteForm } from '@/lib/campaigns/input';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const campaignPath = (id: string) => `/campaigns/${id}`;

/** Errori delle funzioni del database → chiavi del catalogo messaggi. */
function errorKey(message: string | undefined): string {
  if (!message) return 'generic';
  for (const key of ['forbidden', 'invalid_role', 'not_a_member', 'owner_cannot_leave']) {
    if (message.includes(key)) return key;
  }
  return 'generic';
}

export async function createCampaign(formData: FormData) {
  const parsed = campaignSchema.safeParse({
    name: field(formData, 'name'),
    description: field(formData, 'description'),
  });
  if (!parsed.success) redirect('/campaigns?error=invalid_input');
  const rawWorld = field(formData, 'world');
  const world = rawWorld ? uuidSchema.safeParse(rawWorld) : null;
  if (world && !world.success) redirect('/campaigns?error=invalid_input');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login?next=%2Fcampaigns');
  // La RLS richiede che il mondo collegato sia uno di cui si fa parte.
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      world_id: world?.data ?? null,
      owner_id: auth.user.id,
    })
    .select('id')
    .single();
  if (error || !data) redirect('/campaigns?error=generic');
  redirect(campaignPath(data.id));
}

export async function updateCampaign(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect('/campaigns');
  const back = campaignPath(id.data);
  const parsed = campaignSchema.safeParse({
    name: field(formData, 'name'),
    description: field(formData, 'description'),
  });
  if (!parsed.success) redirect(`${back}?error=invalid_input`);
  const patch: { name: string; description: string; world_id?: string | null } = {
    name: parsed.data.name,
    description: parsed.data.description,
  };
  // Il campo del mondo c'è solo nel modulo del DM; chiunque altro lo provi, il database lo rifiuta.
  if (formData.has('world')) {
    const rawWorld = field(formData, 'world');
    const world = rawWorld ? uuidSchema.safeParse(rawWorld) : null;
    if (world && !world.success) redirect(`${back}?error=invalid_input`);
    patch.world_id = world?.data ?? null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', id.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=forbidden`);
  redirect(`${back}?notice=saved`);
}

export async function deleteCampaign(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect('/campaigns');
  if (field(formData, 'confirm') !== 'on') {
    redirect(`${campaignPath(id.data)}?error=confirm_required`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('campaigns').delete().eq('id', id.data).select('id');
  if (error || !data?.length) redirect(`${campaignPath(id.data)}?error=forbidden`);
  redirect('/campaigns?notice=deleted');
}

export async function setMemberRole(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const user = uuidSchema.safeParse(field(formData, 'user'));
  if (!campaign.success || !user.success) redirect('/campaigns');
  const back = campaignPath(campaign.data);
  const role = (['co_dm', 'player', 'observer'] as const).find(
    (r) => r === field(formData, 'role'),
  );
  if (!role) redirect(`${back}?error=invalid_input`);

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_campaign_member_role', {
    p_campaign: campaign.data,
    p_user: user.data,
    p_role: role,
  });
  if (error) redirect(`${back}?error=${errorKey(error.message)}`);
  redirect(`${back}?notice=member_saved`);
}

export async function removeMember(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const user = uuidSchema.safeParse(field(formData, 'user'));
  if (!campaign.success || !user.success) redirect('/campaigns');
  const back = campaignPath(campaign.data);
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_campaign_member', {
    p_campaign: campaign.data,
    p_user: user.data,
  });
  if (error) redirect(`${back}?error=${errorKey(error.message)}`);
  redirect(`${back}?notice=member_removed`);
}

export async function leaveCampaign(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const supabase = await createClient();
  const { error } = await supabase.rpc('leave_campaign', { p_campaign: campaign.data });
  if (error) redirect(`${campaignPath(campaign.data)}?error=${errorKey(error.message)}`);
  redirect('/campaigns?notice=left');
}

export async function createInvite(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const back = campaignPath(campaign.data);
  const parsed = parseInviteForm((name) => {
    const value = formData.get(name);
    return value === null ? undefined : String(value);
  });
  if (!parsed.ok) redirect(`${back}?error=invalid_invite_input`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const expires = new Date(Date.now() + parsed.value.days * 86_400_000);
  // La RLS decide chi può creare quale ruolo; il token nasce dal database.
  const { error } = await supabase.from('campaign_invites').insert({
    campaign_id: campaign.data,
    role: parsed.value.role,
    email: parsed.value.email,
    created_by: auth.user.id,
    expires_at: expires.toISOString(),
    max_uses: parsed.value.uses,
  });
  if (error) redirect(`${back}?error=forbidden`);
  redirect(`${back}?notice=invite_created`);
}

export async function revokeInvite(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const invite = uuidSchema.safeParse(field(formData, 'invite'));
  if (!campaign.success || !invite.success) redirect('/campaigns');
  const back = campaignPath(campaign.data);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('campaign_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invite.data)
    .eq('campaign_id', campaign.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=forbidden`);
  redirect(`${back}?notice=invite_revoked`);
}

/** Accetta un invito. Ogni errore d'invito (inesistente, scaduto, esaurito, per un altro account) è lo stesso per chi lo prova. */
export async function acceptInvite(formData: FormData) {
  const token = field(formData, 'token');
  const back = `/invite/${token}`;
  if (!/^[0-9a-f]{64}$/.test(token)) redirect('/campaigns?error=invalid_invite');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accept_campaign_invite', { p_token: token });
  if (error?.message.includes('already_member')) redirect(`${back}?error=already_member`);
  if (error || !data) redirect('/campaigns?error=invalid_invite');
  redirect(`${campaignPath(data)}?notice=joined`);
}
