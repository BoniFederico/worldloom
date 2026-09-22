'use server';

import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { characterScope } from '@/lib/dice/load';
import { diceModeSchema, labelSchema, notationSchema } from '@/lib/dice/input';
import { rollNotation } from '@/lib/dice/roll';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (campaign: string) => `/campaigns/${campaign}/dice`;

/** Tira i dadi e registra il risultato: chiunque faccia parte della campagna può tirare, anche un osservatore (non è
 * "scrivere" contenuti). Il calcolo avviene qui (mai lato client): la formula può leggere le statistiche di un
 * personaggio usabile da chi tira (il proprio PG, o qualunque se si gestisce la campagna, come per le schede #34). */
export async function createRoll(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  const { supabase, userId, canManage } = await loadCampaign(campaign.data);

  const notation = notationSchema.safeParse(field(formData, 'notation'));
  const mode = diceModeSchema.safeParse(field(formData, 'mode') || 'normal');
  const label = labelSchema.safeParse(field(formData, 'label'));
  if (!notation.success || !mode.success || !label.success) {
    redirect(`${back}?error=invalid_input`);
  }

  const characterField = field(formData, 'character');
  const character = characterField === '' ? null : uuidSchema.safeParse(characterField);
  if (character && !character.success) redirect(`${back}?error=invalid_input`);
  const characterId = character && character.success ? character.data : null;

  const isPrivate = canManage && field(formData, 'private') === 'on';
  const scope = characterId ? await characterScope(supabase, campaign.data, characterId) : {};
  const result = rollNotation(notation.data, scope, mode.data);
  if (!result.ok) redirect(`${back}?error=roll_${result.error.code}`);

  const { error } = await supabase.from('campaign_dice_rolls').insert({
    campaign_id: campaign.data,
    roller_id: userId,
    character_id: characterId,
    label: label.data,
    notation: notation.data,
    mode: mode.data,
    total: result.total,
    groups: result.groups,
    other: result.other ?? null,
    is_private: isPrivate,
  });
  redirect(`${back}?${error ? 'error=failed' : 'notice=rolled'}`);
}
