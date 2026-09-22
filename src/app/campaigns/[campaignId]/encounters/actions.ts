'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { parseConditions } from '@/lib/encounters/conditions';
import {
  encounterNameSchema,
  isValidInitiative,
  parseHp,
  participantNameSchema,
  resourceLabelSchema,
} from '@/lib/encounters/input';
import { advanceTurn } from '@/lib/encounters/turn';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (campaign: string) => `/campaigns/${campaign}/encounters`;
const detailPath = (campaign: string, encounter: string) => `${listPath(campaign)}/${encounter}`;

export async function createEncounter(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  const { supabase, canManage, userId } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const name = encounterNameSchema.safeParse(field(formData, 'name'));
  if (!name.success) redirect(`${back}?error=invalid_input`);
  const { data, error } = await supabase
    .from('campaign_encounters')
    .insert({ campaign_id: campaign.data, name: name.data, created_by: userId })
    .select('id')
    .single();
  if (error || !data) redirect(`${back}?error=failed`);
  redirect(`${detailPath(campaign.data, data.id)}?notice=created`);
}

export async function deleteEncounter(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !id.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  if (field(formData, 'confirm') !== 'on') {
    redirect(`${detailPath(campaign.data, id.data)}?error=confirm_required`);
  }
  const { supabase } = await loadCampaign(campaign.data);
  await supabase.from('campaign_encounters').delete().eq('id', id.data);
  redirect(`${back}?notice=deleted`);
}

/** Passa al partecipante successivo nell'ordine di iniziativa; dopo l'ultimo si torna al primo e il round avanza. */
export async function nextTurn(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const encounter = uuidSchema.safeParse(field(formData, 'encounter'));
  if (!campaign.success || !encounter.success) redirect('/campaigns');
  const back = detailPath(campaign.data, encounter.data);
  const { supabase, canManage } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);
  const [{ data: current }, { count }] = await Promise.all([
    supabase
      .from('campaign_encounters')
      .select('round, turn_index')
      .eq('id', encounter.data)
      .maybeSingle(),
    supabase
      .from('encounter_participants')
      .select('id', { count: 'exact', head: true })
      .eq('encounter_id', encounter.data),
  ]);
  if (!current) redirect(`${back}?error=failed`);
  const next = advanceTurn(count ?? 0, current.round, current.turn_index);
  const { error } = await supabase
    .from('campaign_encounters')
    .update({ round: next.round, turn_index: next.turnIndex })
    .eq('id', encounter.data);
  // Il redirect porta sempre alla stessa pagina (nessun query param a distinguerla): senza forzare la
  // rivalidazione, Next.js può riusare la Router Cache e non rileggere lo stato appena aggiornato.
  revalidatePath(back);
  redirect(`${back}?${error ? 'error=failed' : ''}`);
}

/** Aggiunge un partecipante: un personaggio della campagna (PG o PNG) o una comparsa senza scheda. */
export async function addParticipant(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const encounter = uuidSchema.safeParse(field(formData, 'encounter'));
  if (!campaign.success || !encounter.success) redirect('/campaigns');
  const back = detailPath(campaign.data, encounter.data);
  const { supabase, canManage } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);

  const name = participantNameSchema.safeParse(field(formData, 'name'));
  const resourceLabel = resourceLabelSchema.safeParse(field(formData, 'resource_label'));
  const initiative = Number(field(formData, 'initiative'));
  const hpCurrent = parseHp(field(formData, 'hp_current'));
  const hpMax = parseHp(field(formData, 'hp_max'));
  if (
    !name.success ||
    !resourceLabel.success ||
    !isValidInitiative(initiative) ||
    !hpCurrent.ok ||
    !hpMax.ok
  ) {
    redirect(`${back}?error=invalid_input`);
  }

  const characterField = field(formData, 'character');
  const character = characterField === '' ? null : uuidSchema.safeParse(characterField);
  if (character && !character.success) redirect(`${back}?error=invalid_input`);
  const characterId = character && character.success ? character.data : null;

  const { error } = await supabase.from('encounter_participants').insert({
    encounter_id: encounter.data,
    campaign_id: campaign.data,
    character_id: characterId,
    name: name.data,
    initiative,
    hp_current: hpCurrent.value,
    hp_max: hpMax.value,
    resource_label: resourceLabel.data,
  });
  redirect(`${back}?${error ? 'error=failed' : 'notice=added'}`);
}

/** Aggiorna iniziativa, punti ferita e condizioni di un partecipante già presente. */
export async function updateParticipant(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const encounter = uuidSchema.safeParse(field(formData, 'encounter'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !encounter.success || !id.success) redirect('/campaigns');
  const back = detailPath(campaign.data, encounter.data);
  const { supabase, canManage } = await loadCampaign(campaign.data);
  if (!canManage) redirect(`${back}?error=forbidden`);

  const initiative = Number(field(formData, 'initiative'));
  const hpCurrent = parseHp(field(formData, 'hp_current'));
  const hpMax = parseHp(field(formData, 'hp_max'));
  const conditions = parseConditions(field(formData, 'conditions'));
  if (!isValidInitiative(initiative) || !hpCurrent.ok || !hpMax.ok || !conditions.ok) {
    redirect(`${back}?error=invalid_input`);
  }

  const { error } = await supabase
    .from('encounter_participants')
    .update({
      initiative,
      hp_current: hpCurrent.value,
      hp_max: hpMax.value,
      conditions: conditions.values,
    })
    .eq('id', id.data);
  redirect(`${back}?${error ? 'error=failed' : 'notice=saved'}`);
}

export async function removeParticipant(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const encounter = uuidSchema.safeParse(field(formData, 'encounter'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !encounter.success || !id.success) redirect('/campaigns');
  const back = detailPath(campaign.data, encounter.data);
  const { supabase } = await loadCampaign(campaign.data);
  await supabase.from('encounter_participants').delete().eq('id', id.data);
  redirect(`${back}?notice=removed`);
}
