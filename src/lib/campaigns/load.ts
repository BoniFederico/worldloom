import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';
import type { CampaignRole } from './input';

/** Campagna e ruolo di chi guarda; per chi non ne fa parte (o con un id non valido) la pagina non esiste. */
export async function loadCampaign(campaignId: string) {
  if (!uuidSchema.safeParse(campaignId).success) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, description, world_id, owner_id')
      .eq('id', campaignId)
      .maybeSingle(),
    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', auth.user?.id ?? '')
      .maybeSingle(),
  ]);
  if (!campaign || !membership) notFound();
  const role = membership.role as CampaignRole;
  return {
    supabase,
    campaign,
    role,
    userId: auth.user?.id ?? '',
    canManage: role === 'dm' || role === 'co_dm',
  };
}
