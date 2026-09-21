import type { ValidSchema } from '@/lib/stats/compute';
import type { Plan, SheetRow } from '@/lib/stats/migrate';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Le schede della campagna che chi guarda può leggere (il DM le vede tutte), con la revisione: fino a 500, il tetto del database.
 * Si leggono intere (fino a 250 kB l'una): alla RPC vanno solo quelle che il piano riscrive.
 */
export async function loadSheetRows(supabase: Client, campaignId: string): Promise<SheetRow[]> {
  const { data } = await supabase
    .from('characters')
    .select('id, rev, sheet')
    .eq('campaign_id', campaignId)
    .order('id')
    .limit(500);
  return (data ?? []).map((r) => ({ id: r.id, rev: r.rev, sheet: r.sheet }));
}

/** Revisione dello schema salvato, anche se il suo contenuto non passa più la validazione (0 se non c'è): serve a poterlo sostituire. */
export async function loadStatsRev(supabase: Client, campaignId: string): Promise<number> {
  const { data } = await supabase
    .from('campaign_stats')
    .select('rev')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return data?.rev ?? 0;
}

export type ApplyResult = 'ok' | 'conflict' | 'forbidden' | 'failed';

/** Salva lo schema e le schede riscritte in un'unica transazione (`apply_stats_migration`); `expectedRev` è 0 se non c'è ancora uno schema. */
export async function applyStats(
  supabase: Client,
  campaignId: string,
  next: ValidSchema,
  expectedRev: number,
  sheets: { id: string; rev: number; sheet: unknown }[],
): Promise<ApplyResult> {
  const { error } = await supabase.rpc('apply_stats_migration', {
    p_campaign: campaignId,
    p_schema: next.schema as never,
    p_expected_rev: expectedRev,
    p_sheets: sheets as never,
  });
  if (!error) return 'ok';
  if (error.code === '40001' || error.message.includes('conflict')) return 'conflict';
  if (error.code === '42501' || error.message.includes('forbidden')) return 'forbidden';
  return 'failed';
}

/** Un cambio che tocca valori esistenti (campi tolti con dati, valori riportati nei limiti) va confermato dal DM. */
export const needsGuidance = (plan: Extract<Plan, { ok: true }>) =>
  plan.removed.length > 0 || plan.clamped > 0;
