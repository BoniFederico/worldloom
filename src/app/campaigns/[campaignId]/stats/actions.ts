'use server';

import { redirect } from 'next/navigation';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadStats } from '@/lib/characters/load';
import { applyStats, loadSheetRows, needsGuidance } from '@/lib/characters/migration';
import type { ValidSchema } from '@/lib/stats/compute';
import { describeMigration, planMigration, type MigrationInfo } from '@/lib/stats/migrate';
import { STATS_PRESETS } from '@/lib/stats/presets';
import { validateStatsText, validateStatsValue, type StatsError } from '@/lib/stats/schema';
import { uuidSchema } from '@/lib/worlds/schemas';

export type StatsState = {
  status:
    | 'idle'
    | 'checked'
    | 'saved'
    | 'migrated'
    | 'migration'
    | 'invalid'
    | 'invalid_move'
    | 'conflict'
    | 'forbidden'
    | 'failed';
  /** Il testo del modulo, per non perderlo quando ci sono errori. */
  text: string;
  errors: StatsError[];
  /** Con `migration`: che cosa tocca il cambio e dove si possono spostare i valori. */
  migration?: MigrationInfo;
  /** Con `migrated`: quante schede sono state aggiornate. */
  updated?: number;
};

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

type Client = Awaited<ReturnType<typeof loadCampaign>>['supabase'];

/**
 * Salva `next` come schema della campagna. Se ci sono schede che il cambio tocca (campi tolti con valori, valori da riportare nei
 * limiti) e il DM non ha ancora scelto, restituisce `guidance` con che cosa mostrare; altrimenti applica lo schema e le schede
 * riscritte in un'unica transazione. Il piano si ricalcola sempre qui: dal client arrivano solo le scelte (`moves`).
 */
async function saveSchema(
  supabase: Client,
  campaignId: string,
  next: ValidSchema,
  moves: Record<string, string | null> | null,
): Promise<
  | { kind: 'done'; updated: number }
  | { kind: 'guidance'; info: MigrationInfo }
  | { kind: 'error'; status: 'invalid_move' | 'conflict' | 'forbidden' | 'failed' }
> {
  const [old, rows] = await Promise.all([
    loadStats(supabase, campaignId),
    loadSheetRows(supabase, campaignId),
  ]);
  let sheets: { id: string; rev: number; sheet: unknown }[] = [];
  if (old) {
    const plan = planMigration(old.valid, next, rows, moves ?? {});
    if (!plan.ok) return { kind: 'error', status: plan.error };
    if (moves === null && needsGuidance(plan)) {
      return { kind: 'guidance', info: describeMigration(old.valid.schema, next.schema, plan) };
    }
    sheets = plan.sheets;
  }
  const result = await applyStats(supabase, campaignId, next, old?.rev ?? 0, sheets);
  return result === 'ok'
    ? { kind: 'done', updated: sheets.length }
    : { kind: 'error', status: result };
}

/** Scelte del DM dal modulo: `move:<sezione.chiave>` = chiave nuova (vuoto = elimina i valori). */
function movesFrom(formData: FormData): Record<string, string | null> {
  const moves: Record<string, string | null> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith('move:')) moves[name.slice(5)] = String(value) || null;
  }
  return moves;
}

/**
 * Verifica, salva o (con `intent=migrate`) salva applicando la migrazione guidata alle schede esistenti. Solo il DM. Gli errori
 * tornano con riga, colonna e campo, e il testo digitato resta nel campo.
 */
export async function submitStats(_prev: StatsState, formData: FormData): Promise<StatsState> {
  const id = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!id.success) redirect('/campaigns');
  const text = field(formData, 'schema');
  const { supabase, role } = await loadCampaign(id.data);
  if (role !== 'dm') return { status: 'forbidden', text, errors: [] };
  const result = validateStatsText(text);
  if (!result.ok) return { status: 'invalid', text, errors: result.errors };
  if (field(formData, 'intent') === 'check') return { status: 'checked', text, errors: [] };

  const next: ValidSchema = { schema: result.schema, derivedOrder: result.derivedOrder };
  const migrate = field(formData, 'intent') === 'migrate';
  const outcome = await saveSchema(supabase, id.data, next, migrate ? movesFrom(formData) : null);
  if (outcome.kind === 'guidance')
    return { status: 'migration', text, errors: [], migration: outcome.info };
  if (outcome.kind === 'error') return { status: outcome.status, text, errors: [] };
  return outcome.updated
    ? { status: 'migrated', text, errors: [], updated: outcome.updated }
    : { status: 'saved', text, errors: [] };
}

/**
 * Sostituisce lo schema con un preset; con `reset` è il «ripristino dello schema di default» (il d20). Se il cambio tocca schede
 * esistenti non applica niente: porta l'editor con il preset già caricato (`?draft=`), dove il DM sceglie che cosa fare dei valori.
 */
export async function applyPreset(formData: FormData) {
  const id = uuidSchema.safeParse(field(formData, 'campaign'));
  if (!id.success) redirect('/campaigns');
  const back = `/campaigns/${id.data}/stats`;
  const reset = field(formData, 'reset') === '1';
  const preset = STATS_PRESETS.find((p) => p.id === (reset ? 'd20' : field(formData, 'preset')));
  if (!preset) redirect(`${back}?error=unknown_preset`);
  const { supabase, role } = await loadCampaign(id.data);
  if (role !== 'dm') redirect(`${back}?error=forbidden`);
  const valid = validateStatsValue(preset.schema);
  if (!valid.ok) redirect(`${back}?error=failed`);
  const outcome = await saveSchema(
    supabase,
    id.data,
    { schema: valid.schema, derivedOrder: valid.derivedOrder },
    null,
  );
  if (outcome.kind === 'guidance') redirect(`${back}?draft=${preset.id}&notice=review`);
  if (outcome.kind === 'error')
    redirect(`${back}?error=${outcome.status === 'conflict' ? 'conflict' : 'failed'}`);
  redirect(`${back}?notice=${reset ? 'reset' : 'preset_applied'}`);
}
