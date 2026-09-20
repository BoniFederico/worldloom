'use server';

import { redirect } from 'next/navigation';
import { inverseFor, parseRelationInput, type RelationInput } from '@/lib/relations/input';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const snippetPath = (world: string, id: string) => `/worlds/${world}/snippets/${id}`;

const getter = (formData: FormData) => (name: string) => {
  const value = formData.get(name);
  return value === null ? undefined : String(value);
};

/** Quanto l'utente ha digitato nel form della relazione, da rimostrare se l'operazione non riesce. */
export type RelationDraft = Record<string, string>;
export type RelationState = { error: string; draft: RelationDraft } | null;

function draftOf(formData: FormData): RelationDraft {
  const draft: RelationDraft = {};
  for (const name of [
    'target',
    'label',
    'inverse',
    'notes',
    'from_year',
    'from_month',
    'from_day',
    'to_year',
    'to_month',
    'to_day',
  ]) {
    draft[name] = field(formData, name);
  }
  return draft;
}

const toColumns = (input: RelationInput) => ({
  label: input.label,
  inverse_label: input.inverse,
  notes: input.notes,
  valid_from: input.from,
  valid_to: input.to,
});

/** Errori del database che l'utente può correggere. */
function dbError(error: { code?: string; message?: string }): string {
  if (error.message?.includes('relation_constraint_source')) return 'constraint_source';
  if (error.message?.includes('relation_constraint_target')) return 'constraint_target';
  if (error.code === '23505') return 'duplicate_relation';
  if (error.code === '23514') {
    return error.message?.includes('relations_notes_length') ? 'invalid_notes' : 'invalid_validity';
  }
  return 'relation_failed';
}

export async function createRelation(
  _prev: RelationState,
  formData: FormData,
): Promise<RelationState> {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const source = uuidSchema.safeParse(field(formData, 'id'));
  if (!world.success || !source.success) redirect('/worlds');
  const draft = draftOf(formData);
  const fail = (error: string): RelationState => ({ error, draft });

  const parsed = parseRelationInput(getter(formData));
  if (!parsed.ok) return fail(parsed.error);
  const input = parsed.value;
  if (input.target === source.data) return fail('same_snippet');

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) return fail('relation_forbidden');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  // Entrambi gli estremi devono essere snippet attivi del mondo (la RLS nasconde quelli non leggibili).
  const { data: ends } = await supabase
    .from('snippets')
    .select('id')
    .eq('world_id', world.data)
    .is('deleted_at', null)
    .in('id', [source.data, input.target]);
  if (ends?.length !== 2) return fail('target_missing');

  // Un tipo di relazione con la stessa etichetta fornisce la sua inversa (i vincoli li controlla il database).
  if (!input.inverse) {
    const { data: types } = await supabase
      .from('relation_types')
      .select('label, inverse_label')
      .eq('world_id', world.data)
      .not('inverse_label', 'is', null);
    input.inverse = inverseFor(input.label, types ?? []);
  }

  // Senza etichetta inversa si riusa quella già associata a questa etichetta nel mondo (confronto in codice,
  // non con `ilike`: nessun carattere jolly). Non è atomico: scritture concorrenti possono dare inverse diverse.
  if (!input.inverse) {
    const { data: known } = await supabase
      .from('relations')
      .select('label, inverse_label')
      .eq('world_id', world.data)
      .not('inverse_label', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    input.inverse = inverseFor(input.label, known ?? []);
  }

  const { error } = await supabase.from('relations').insert({
    world_id: world.data,
    source_id: source.data,
    target_id: input.target,
    created_by: auth.user.id,
    ...toColumns(input),
  });
  if (error) return fail(dbError(error));
  redirect(`${snippetPath(world.data, source.data)}?notice=relation_added#relations`);
}

export async function updateRelation(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const source = uuidSchema.safeParse(field(formData, 'id'));
  const relation = uuidSchema.safeParse(field(formData, 'relation'));
  if (!world.success || !source.success || !relation.success) redirect('/worlds');
  const back = snippetPath(world.data, source.data);

  // Il form di modifica rimanda l'altro estremo in `target`: qui non cambia, serve solo alla validazione.
  const parsed = parseRelationInput(getter(formData));
  if (!parsed.ok) redirect(`${back}?error=${parsed.error}#relations`);

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) redirect(`${back}?error=relation_forbidden#relations`);
  const { data, error } = await supabase
    .from('relations')
    .update(toColumns(parsed.value))
    .eq('id', relation.data)
    .eq('world_id', world.data)
    .select('id');
  if (error) redirect(`${back}?error=${dbError(error)}#relations`);
  if (!data?.length) redirect(`${back}?error=relation_failed#relations`);
  redirect(`${back}?notice=relation_saved#relations`);
}

export async function deleteRelation(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const source = uuidSchema.safeParse(field(formData, 'id'));
  const relation = uuidSchema.safeParse(field(formData, 'relation'));
  if (!world.success || !source.success || !relation.success) redirect('/worlds');
  const back = snippetPath(world.data, source.data);

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) redirect(`${back}?error=relation_forbidden#relations`);
  const { data, error } = await supabase
    .from('relations')
    .delete()
    .eq('id', relation.data)
    .eq('world_id', world.data)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=relation_failed#relations`);
  redirect(`${back}?notice=relation_removed#relations`);
}
