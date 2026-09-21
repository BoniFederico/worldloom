import { validateStatsValue } from '@/lib/stats/schema';
import type { ValidSchema } from '@/lib/stats/compute';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type CampaignStats = { valid: ValidSchema; rev: number };

/** Schema di statistiche della campagna, ricontrollato alla lettura (il database non ne conosce il contenuto). `null` se non c'è. */
export async function loadStats(
  supabase: Client,
  campaignId: string,
): Promise<CampaignStats | null> {
  const { data } = await supabase
    .from('campaign_stats')
    .select('schema, rev')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (!data) return null;
  const result = validateStatsValue(data.schema);
  if (!result.ok) return null;
  return { valid: { schema: result.schema, derivedOrder: result.derivedOrder }, rev: data.rev };
}
