import type { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import type { ImportPlan } from './world';

type Client = Awaited<ReturnType<typeof createClient>>;
type Plan = Extract<ImportPlan, { ok: true }>;

const CHUNK = 500;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/**
 * Crea un mondo nuovo (di cui l'utente è proprietario) con il contenuto del piano. Le scritture passano dalla
 * RLS come per qualsiasi altra operazione. Se una fallisce il mondo appena creato viene eliminato (a cascata),
 * così non restano importazioni a metà. Restituisce l'id del mondo, o `null`.
 */
export async function importWorld(
  supabase: Client,
  userId: string,
  plan: Plan,
): Promise<string | null> {
  const { data: world, error } = await supabase
    .from('worlds')
    .insert({ name: plan.world.name, owner_id: userId })
    .select('id')
    .single();
  if (error || !world) return null;
  const worldId = world.id;

  const steps: (() => PromiseLike<{ error: unknown }>)[] = [
    ...chunks(plan.categories).map(
      (rows) => () =>
        supabase.from('categories').insert(
          rows.map((c) => ({
            ...c,
            world_id: worldId,
            fields_schema: c.fields_schema as Json,
            content_template: c.content_template as Json,
          })),
        ),
    ),
    ...chunks(plan.snippets).map(
      (rows) => () =>
        supabase.from('snippets').insert(
          rows.map((s) => ({
            ...s,
            world_id: worldId,
            created_by: userId,
            fields: s.fields as Json,
            body: s.body as unknown as Json,
          })),
        ),
    ),
    ...chunks(plan.snippetCategories).map(
      (rows) => () =>
        supabase.from('snippet_categories').insert(rows.map((r) => ({ ...r, world_id: worldId }))),
    ),
    ...chunks(plan.relationTypes).map(
      (rows) => () =>
        supabase.from('relation_types').insert(rows.map((r) => ({ ...r, world_id: worldId }))),
    ),
    ...chunks(plan.relations).map(
      (rows) => () =>
        supabase.from('relations').insert(
          rows.map((r) => ({
            ...r,
            world_id: worldId,
            created_by: userId,
            valid_from: r.valid_from as Json,
            valid_to: r.valid_to as Json,
          })),
        ),
    ),
  ];

  for (const step of steps) {
    const { error: stepError } = await step();
    if (stepError) {
      await supabase.from('worlds').delete().eq('id', worldId);
      return null;
    }
  }
  return worldId;
}
