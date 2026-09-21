'use server';

import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { STATS_PRESETS } from '@/lib/stats/presets';
import { validateStatsText, type StatsError } from '@/lib/stats/schema';
import { uuidSchema } from '@/lib/worlds/schemas';

export type StatsState = {
  status: 'idle' | 'checked' | 'saved' | 'invalid' | 'forbidden' | 'failed';
  /** Il testo del modulo, per non perderlo quando ci sono errori. */
  text: string;
  errors: StatsError[];
};

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

async function store(campaignId: string, schema: unknown): Promise<boolean> {
  const { supabase, role } = await loadCampaign(campaignId);
  if (role !== 'dm') return false;
  const { data: existing } = await supabase
    .from('campaign_stats')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  const json = schema as never;
  const { error } = existing
    ? await supabase.from('campaign_stats').update({ schema: json }).eq('campaign_id', campaignId)
    : await supabase.from('campaign_stats').insert({ campaign_id: campaignId, schema: json });
  return !error;
}

/** Verifica o salva il testo JSON dello schema (solo il DM). Gli errori tornano con riga, colonna e campo. */
export async function submitStats(_prev: StatsState, formData: FormData): Promise<StatsState> {
  const id = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!id.success) redirect('/campaigns');
  const text = field(formData, 'schema');
  const { role } = await loadCampaign(id.data);
  if (role !== 'dm') return { status: 'forbidden', text, errors: [] };
  const result = validateStatsText(text);
  if (!result.ok) return { status: 'invalid', text, errors: result.errors };
  if (field(formData, 'intent') !== 'save') return { status: 'checked', text, errors: [] };
  const saved = await store(id.data, result.schema);
  return { status: saved ? 'saved' : 'failed', text, errors: [] };
}

/** Sostituisce lo schema con un preset; con `reset` è il «ripristino dello schema di default» (il d20). */
export async function applyPreset(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!id.success) redirect('/campaigns');
  const back = `/campaigns/${id.data}/stats`;
  const reset = field(formData, 'reset') === '1';
  const preset = STATS_PRESETS.find((p) => p.id === (reset ? 'd20' : field(formData, 'preset')));
  if (!preset) redirect(`${back}?error=unknown_preset`);
  const { role } = await loadCampaign(id.data);
  if (role !== 'dm') redirect(`${back}?error=forbidden`);
  const saved = await store(id.data, preset.schema);
  redirect(`${back}?${saved ? `notice=${reset ? 'reset' : 'preset_applied'}` : 'error=failed'}`);
}
