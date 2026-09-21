'use server';

import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { characterInput } from '@/lib/characters/input';
import { loadStats } from '@/lib/characters/load';
import { parseSheetForm, SHEET_ERROR_CODES } from '@/lib/characters/sheet';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (campaign: string) => `/campaigns/${campaign}/characters`;

function raw(formData: FormData) {
  return {
    name: field(formData, 'name'),
    kind: field(formData, 'kind'),
    owner: field(formData, 'owner'),
    notes: field(formData, 'notes'),
  };
}

/** Errori del database → chiavi del catalogo messaggi. */
function errorKey(message: string | undefined): string {
  if (message?.includes('too_many_characters')) return 'too_many';
  if (message?.includes('proprietario')) return 'invalid_owner';
  return 'failed';
}

export async function createCharacter(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!campaign.success) redirect('/campaigns');
  const back = listPath(campaign.data);
  const { supabase, canManage, userId, role } = await loadCampaign(campaign.data);
  if (role === 'observer') redirect(`${back}?error=forbidden`);
  const input = characterInput(raw(formData), canManage, userId);
  if (!input) redirect(`${back}?error=invalid_input`);
  const stats = await loadStats(supabase, campaign.data);
  if (!stats) redirect(`${back}?error=no_schema`);

  // Il modulo di creazione non ha i campi dello schema: la scheda parte dai predefiniti.
  const start = parseSheetForm(stats.valid, () => undefined);
  const { data, error } = await supabase
    .from('characters')
    .insert({
      campaign_id: campaign.data,
      kind: input.kind,
      name: input.name,
      owner_id: input.owner,
      notes: input.notes,
      sheet: start.ok ? (start.sheet as never) : {},
      created_by: userId,
    })
    .select('id')
    .single();
  if (error || !data) redirect(`${back}?error=${errorKey(error?.message)}`);
  redirect(`${back}/${data.id}?notice=created`);
}

/** Salva nome, note, proprietario (solo chi gestisce) e i valori della scheda. Se qualcun altro ha salvato prima: conflitto. */
export async function saveCharacter(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !id.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${id.data}`;
  const { supabase, canManage, userId, role } = await loadCampaign(campaign.data);
  if (role === 'observer') redirect(`${back}?error=forbidden`);
  const rev = Number(field(formData, 'rev'));
  if (!Number.isInteger(rev)) redirect(`${back}?error=invalid_input`);

  const { data: current } = await supabase
    .from('characters')
    .select('kind, owner_id')
    .eq('id', id.data)
    .eq('campaign_id', campaign.data)
    .maybeSingle();
  if (!current) redirect(`${listPath(campaign.data)}?error=not_found`);
  // Chi non gestisce non cambia tipo né proprietario: si riusano quelli attuali.
  const input = characterInput(
    canManage
      ? raw(formData)
      : { ...raw(formData), kind: current.kind, owner: current.owner_id ?? '' },
    true,
    userId,
  );
  if (!input) redirect(`${back}?error=invalid_input`);
  const stats = await loadStats(supabase, campaign.data);
  if (!stats) redirect(`${back}?error=no_schema`);

  const sheet = parseSheetForm(stats.valid, (name) => {
    const v = formData.get(name);
    return v === null ? undefined : String(v);
  });
  if (!sheet.ok) {
    const first = sheet.errors[0]!;
    const code = SHEET_ERROR_CODES.includes(first.code) ? first.code : 'not_a_number';
    redirect(`${back}?error=invalid_sheet&field=${encodeURIComponent(first.field)}&code=${code}`);
  }

  const common = { name: input.name, notes: input.notes, sheet: sheet.sheet as never };
  const patch = canManage ? { ...common, kind: input.kind, owner_id: input.owner } : common;
  const { data, error } = await supabase
    .from('characters')
    .update(patch)
    .eq('id', id.data)
    .eq('rev', rev)
    .select('id');
  if (error) redirect(`${back}?error=${errorKey(error.message)}`);
  if (!data?.length) redirect(`${back}?error=conflict`);
  redirect(`${back}?notice=saved`);
}

export async function deleteCharacter(formData: FormData) {
  const campaign = uuidSchema.safeParse(field(formData, 'campaign'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!campaign.success || !id.success) redirect('/campaigns');
  const back = `${listPath(campaign.data)}/${id.data}`;
  if (field(formData, 'confirm') !== 'yes') redirect(`${back}?error=confirm_required`);
  const { supabase } = await loadCampaign(campaign.data);
  const { data, error } = await supabase
    .from('characters')
    .delete()
    .eq('id', id.data)
    .eq('campaign_id', campaign.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=failed`);
  redirect(`${listPath(campaign.data)}?notice=deleted`);
}
