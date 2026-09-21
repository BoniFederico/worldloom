'use server';

import { redirect } from 'next/navigation';
import { loadSnippetDefs } from '@/lib/kanban/load';
import { parseVisibilityForm, type FieldLevel, type Level } from '@/lib/visibility/input';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** Errori della funzione del database → chiavi del catalogo messaggi. */
function errorKey(message: string | undefined): string {
  for (const key of ['users_required', 'invalid_users', 'invalid_note', 'forbidden']) {
    if (message?.includes(key)) return key;
  }
  return 'visibility_failed';
}

type Client = Awaited<ReturnType<typeof loadWorld>>['supabase'];

async function setVisibility(
  supabase: Client,
  kind: 'snippet' | 'relation' | 'pin' | 'field',
  item: string,
  key: string | null,
  level: Level,
  input: { users: string[]; session: string | null; note: string },
) {
  return supabase.rpc('set_visibility', {
    p_kind: kind,
    p_item: item,
    p_field: key as string,
    p_level: level,
    p_users: input.users,
    p_session: input.session as string,
    p_note: input.note,
  });
}

/**
 * Livello di uno snippet e dei suoi campi, con i destinatari scelti dal DM. Ogni cambio è registrato; solo chi scrive
 * (la funzione del database lo verifica comunque).
 */
export async function applySnippetVisibility(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!world.success || !id.success) redirect('/worlds');
  const back = `/worlds/${world.data}/snippets/${id.data}`;

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const defs = await loadSnippetDefs(supabase, world.data, id.data);
  if (!defs) redirect(`${back}?error=visibility_failed`);

  const parsed = parseVisibilityForm(
    (name) => {
      const v = formData.get(name);
      return v === null ? undefined : String(v);
    },
    (name) => formData.getAll(name).map(String),
    defs.map((d) => d.key),
  );
  if (!parsed.ok) redirect(`${back}?error=invalid_visibility`);
  const { level, users, fields, fieldUsers, note, session } = parsed.value;

  // Ordine sicuro: prima si restringono i campi (segreti o condivisi), poi si cambia lo snippet, per ultimo si allargano i campi
  // («come lo snippet»). Se una chiamata fallisce a metà, lo stato resta almeno restrittivo quanto prima: mai un campo in chiaro
  // in uno snippet appena rivelato.
  const fieldCall = (key: string, fieldLevel: FieldLevel) =>
    setVisibility(supabase, 'field', id.data, key, fieldLevel, {
      users: fieldUsers[key] ?? [],
      session,
      note,
    });
  const restricting = Object.entries(fields).filter(([, l]) => l !== 'members');
  const relaxing = Object.entries(fields).filter(([, l]) => l === 'members');
  for (const [key, fieldLevel] of restricting) {
    const r = await fieldCall(key, fieldLevel);
    if (r.error) redirect(`${back}?error=${errorKey(r.error.message)}`);
  }
  const snippetResult = await setVisibility(supabase, 'snippet', id.data, null, level, {
    users,
    session,
    note,
  });
  if (snippetResult.error) redirect(`${back}?error=${errorKey(snippetResult.error.message)}`);
  for (const [key, fieldLevel] of relaxing) {
    const r = await fieldCall(key, fieldLevel);
    if (r.error) redirect(`${back}?error=${errorKey(r.error.message)}`);
  }
  redirect(`${back}?notice=visibility_saved`);
}

/** Livello di una relazione o di un pin, con gli stessi destinatari e la stessa registrazione. */
export async function applyItemVisibility(formData: FormData) {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  const item = uuidSchema.safeParse(field(formData, 'item'));
  const kind = field(formData, 'kind');
  if (!world.success || !item.success || (kind !== 'relation' && kind !== 'pin'))
    redirect('/worlds');
  // Si torna alla pagina da cui si è partiti: lo snippet della relazione o la mappa del pin.
  const from = uuidSchema.safeParse(field(formData, 'from'));
  if (!from.success) redirect(`/worlds/${world.data}`);
  const back =
    kind === 'relation'
      ? `/worlds/${world.data}/snippets/${from.data}`
      : `/worlds/${world.data}/maps/${from.data}`;

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const parsed = parseVisibilityForm(
    (name) => {
      const v = formData.get(name);
      return v === null ? undefined : String(v);
    },
    (name) => formData.getAll(name).map(String),
  );
  if (!parsed.ok) redirect(`${back}?error=invalid_visibility`);
  const { level, users, note, session } = parsed.value;
  const r = await setVisibility(supabase, kind, item.data, null, level, { users, session, note });
  if (r.error) redirect(`${back}?error=${errorKey(r.error.message)}`);
  redirect(`${back}?notice=visibility_saved`);
}
