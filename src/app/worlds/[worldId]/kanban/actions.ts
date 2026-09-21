'use server';

import { redirect } from 'next/navigation';
import { kanbanQuery, parseKanbanParams } from '@/lib/kanban/params';
import { loadSnippetDefs } from '@/lib/kanban/load';
import { planMove } from '@/lib/kanban/move';
import type { Json } from '@/lib/supabase/database.types';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** Sposta una card in un'altra colonna: cambia lo stato o il campo a scelta dello snippet, come farebbe il salvataggio. */
export async function moveCard(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  const params = parseKanbanParams({
    by: field(formData, 'by'),
    category: field(formData, 'category'),
  });
  const qs = kanbanQuery(params);
  const back = (key: 'notice' | 'error', value: string) =>
    redirect(`/worlds/${world.data}/kanban?${[qs, `${key}=${value}`].filter(Boolean).join('&')}`);

  const id = uuidSchema.safeParse(field(formData, 'id'));
  const token = field(formData, 'updated');
  if (!id.success || !params.by || !token) return back('error', 'move_failed');

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) return back('error', 'forbidden');

  const [{ data: row }, defs, { data: restrictedRows }] = await Promise.all([
    supabase
      .from('snippets')
      .select('status, fields, updated_at')
      .eq('id', id.data)
      .eq('world_id', world.data)
      .is('deleted_at', null)
      .maybeSingle(),
    loadSnippetDefs(supabase, world.data, id.data),
    // Campi riservati: stanno in una tabella a parte, non in `fields`.
    supabase.from('snippet_restricted_fields').select('key, value').eq('snippet_id', id.data),
  ]);
  const restricted = Object.fromEntries(
    (restrictedRows ?? []).map((r) => [r.key, r.value === null ? undefined : r.value]),
  );
  if (!row || !defs) return back('error', 'move_failed');
  if (row.updated_at !== token) return back('error', 'conflict');

  const plan = planMove({
    by: params.by,
    to: field(formData, 'to'),
    status: row.status,
    fields: {
      ...(typeof row.fields === 'object' && row.fields !== null && !Array.isArray(row.fields)
        ? (row.fields as Record<string, unknown>)
        : {}),
      ...restricted,
    },
    defs,
  });
  if (!plan.ok) return back('error', plan.error);

  // La condizione su `updated_at` chiude la finestra tra lettura e scrittura: senza righe cambiate, qualcuno ha modificato prima.
  const { data, error } = await supabase
    .from('snippets')
    .update(
      'status' in plan.patch
        ? { status: plan.patch.status }
        : { fields: plan.patch.fields as unknown as Json },
    )
    .eq('id', id.data)
    .eq('world_id', world.data)
    .eq('updated_at', token)
    .select('id');
  if (error) return back('error', 'move_failed');
  if (!data?.length) return back('error', 'conflict');
  // Se il campo spostato è riservato, il nuovo valore va nella sua tabella (il trigger lo ha tolto da `fields`).
  if ('fields' in plan.patch && params.by in restricted) {
    const value = (plan.patch.fields[params.by] ?? null) as Json;
    const r = await supabase
      .from('snippet_restricted_fields')
      .update({ value })
      .eq('snippet_id', id.data)
      .eq('key', params.by);
    if (r.error) return back('error', 'move_failed');
  }
  return back('notice', 'moved');
}
