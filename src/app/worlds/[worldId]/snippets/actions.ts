'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { fieldsSchema, validateSnippetFields, type FieldDefinition } from '@/lib/fields/fields';
import type { Json } from '@/lib/supabase/database.types';
import { docToText, sanitizeBody, textToDoc } from '@/lib/snippets/body';
import { mergeFieldInput } from '@/lib/snippets/form';
import { snippetTitleSchema } from '@/lib/snippets/schemas';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const listPath = (worldId: string) => `/worlds/${worldId}/snippets`;

function worldOf(formData: FormData): string {
  const world = uuidSchema.safeParse(field(formData, 'world'));
  if (!world.success) redirect('/worlds');
  return world.data;
}

function snippetOf(formData: FormData, world: string): string {
  const id = uuidSchema.safeParse(field(formData, 'id'));
  if (!id.success) redirect(listPath(world));
  return id.data;
}

export async function createSnippet(formData: FormData) {
  const world = worldOf(formData);
  const title = snippetTitleSchema.safeParse(field(formData, 'title'));
  if (!title.success) redirect(`${listPath(world)}?error=invalid_title`);
  const category = uuidSchema.safeParse(field(formData, 'category'));

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${listPath(world)}?error=forbidden`);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data, error } = await supabase
    .from('snippets')
    .insert({ world_id: world, title: title.data, created_by: auth.user.id })
    .select('id')
    .single();
  if (error || !data) redirect(`${listPath(world)}?error=generic`);
  if (category.success) {
    // La FK composita rifiuta una categoria di un altro mondo: in tal caso lo snippet resta senza categoria.
    await supabase
      .from('snippet_categories')
      .insert({ world_id: world, snippet_id: data.id, category_id: category.data });
  }
  redirect(`${listPath(world)}/${data.id}?notice=created`);
}

const STATUSES = ['draft', 'final'] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function saveSnippet(formData: FormData) {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const back = `${listPath(world)}/${id}`;

  const title = snippetTitleSchema.safeParse(field(formData, 'title'));
  if (!title.success) redirect(`${back}?error=invalid_title`);
  const status = STATUSES.find((s) => s === field(formData, 'status')) ?? 'draft';
  const token = field(formData, 'updated');
  const chosen = [...new Set(formData.getAll('category').map(String))].filter(
    (c) => uuidSchema.safeParse(c).success,
  );

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);

  const [{ data: row }, { data: cats }] = await Promise.all([
    supabase
      .from('snippets')
      .select('body, fields, updated_at')
      .eq('id', id)
      .eq('world_id', world)
      .is('deleted_at', null)
      .maybeSingle(),
    chosen.length
      ? supabase
          .from('categories')
          .select('id, fields_schema')
          .eq('world_id', world)
          .in('id', chosen)
      : Promise.resolve({ data: [] as { id: string; fields_schema: Json }[] }),
  ]);
  if (!row) redirect(`${listPath(world)}?error=not_found`);
  if (row.updated_at !== token) redirect(`${back}?error=conflict`);

  // Le categorie del mondo: quelle sconosciute (o di altri mondi) vengono ignorate.
  const validCategories = (cats ?? []).map((c) => c.id);
  const defs: FieldDefinition[] = [];
  for (const c of cats ?? []) {
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const def of parsed.data) if (!defs.some((d) => d.key === def.key)) defs.push(def);
  }

  const merged = mergeFieldInput(defs, asRecord(row.fields), (name) => {
    const value = formData.get(name);
    return value === null ? undefined : String(value);
  });
  const checked = validateSnippetFields(defs, merged, { enforceRequired: status === 'final' });
  const badKeys = Object.keys(checked.errors);
  if (badKeys.length) {
    redirect(`${back}?error=invalid_fields&keys=${encodeURIComponent(badKeys.join(','))}`);
  }

  // Un riferimento a snippet deve puntare a uno snippet leggibile dello stesso mondo.
  const refKeys = defs.filter((d) => d.type === 'snippet_ref' && d.key in checked.values);
  if (refKeys.length) {
    const wanted = [...new Set(refKeys.map((d) => String(checked.values[d.key])))];
    const { data: found } = await supabase
      .from('snippets')
      .select('id')
      .eq('world_id', world)
      .in('id', wanted);
    const known = new Set((found ?? []).map((s) => s.id));
    const missing = refKeys.filter((d) => !known.has(String(checked.values[d.key])));
    if (missing.length) {
      redirect(
        `${back}?error=invalid_fields&keys=${encodeURIComponent(missing.map((d) => d.key).join(','))}`,
      );
    }
  }

  // Il corpo si aggiorna solo se il testo è cambiato: così non si perde la formattazione esistente.
  const text = field(formData, 'body').replace(/\r\n?/g, '\n');
  const body =
    text.trim() === docToText(row.body).trim() ? sanitizeBody(row.body) : textToDoc(text);

  const { data, error } = await supabase
    .from('snippets')
    .update({
      title: title.data,
      status,
      body: body as unknown as Json,
      fields: checked.values as unknown as Json,
    })
    .eq('id', id)
    .eq('updated_at', token)
    .select('id');
  if (error) redirect(`${back}?error=generic`);
  if (!data?.length) redirect(`${back}?error=conflict`);

  const categories = supabase.from('snippet_categories');
  const remove = categories.delete().eq('snippet_id', id);
  const { error: removeError } = await (validCategories.length
    ? remove.not('category_id', 'in', `(${validCategories.join(',')})`)
    : remove);
  const { error: addError } = validCategories.length
    ? await supabase.from('snippet_categories').upsert(
        validCategories.map((category_id) => ({ world_id: world, snippet_id: id, category_id })),
        { onConflict: 'snippet_id,category_id', ignoreDuplicates: true },
      )
    : { error: null };
  if (removeError || addError) redirect(`${back}?error=generic`);
  redirect(`${back}?notice=saved`);
}

type Patch = { archived_at?: string | null; deleted_at?: string | null };

async function setState(formData: FormData, patch: Patch, notice: string, to: 'list' | 'back') {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const back = `${listPath(world)}/${id}`;
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data, error } = await supabase
    .from('snippets')
    .update(patch)
    .eq('id', id)
    .eq('world_id', world)
    .select('id');
  if (error || !data?.length) redirect(`${back}?error=generic`);
  redirect(to === 'list' ? `${listPath(world)}?notice=${notice}` : `${back}?notice=${notice}`);
}

const now = () => new Date().toISOString();

export async function archiveSnippet(formData: FormData) {
  return setState(formData, { archived_at: now() }, 'archived', 'list');
}
export async function unarchiveSnippet(formData: FormData) {
  return setState(formData, { archived_at: null }, 'unarchived', 'back');
}
export async function trashSnippet(formData: FormData) {
  return setState(formData, { deleted_at: now() }, 'trashed', 'list');
}
export async function restoreSnippet(formData: FormData) {
  return setState(formData, { deleted_at: null }, 'restored', 'back');
}

export async function deleteSnippetForever(formData: FormData) {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const trash = `${listPath(world)}?view=trash`;
  if (field(formData, 'confirm') !== 'on') redirect(`${trash}&error=confirm_required`);
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${trash}&error=forbidden`);
  // Solo dal cestino: uno snippet attivo non si elimina definitivamente con questa azione.
  const { data, error } = await supabase
    .from('snippets')
    .delete()
    .eq('id', id)
    .eq('world_id', world)
    .not('deleted_at', 'is', null)
    .select('id');
  if (error || !data?.length) redirect(`${trash}&error=generic`);
  redirect(`${trash}&notice=deleted`);
}

export async function duplicateSnippet(formData: FormData) {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const back = `${listPath(world)}/${id}`;
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: source } = await supabase
    .from('snippets')
    .select('title, body, fields, tags, aliases, visibility')
    .eq('id', id)
    .eq('world_id', world)
    .is('deleted_at', null)
    .maybeSingle();
  if (!source) redirect(`${listPath(world)}?error=not_found`);

  const t = await getTranslations('Snippets');
  const { data: copy, error } = await supabase
    .from('snippets')
    .insert({
      world_id: world,
      created_by: auth.user.id,
      title: `${source.title}${t('copySuffix')}`.slice(0, 300),
      body: source.body,
      fields: source.fields,
      tags: source.tags,
      aliases: source.aliases,
      visibility: source.visibility,
    })
    .select('id')
    .single();
  if (error || !copy) redirect(`${back}?error=generic`);

  const { data: cats } = await supabase
    .from('snippet_categories')
    .select('category_id')
    .eq('snippet_id', id);
  if (cats?.length) {
    await supabase
      .from('snippet_categories')
      .insert(
        cats.map((c) => ({ world_id: world, snippet_id: copy.id, category_id: c.category_id })),
      );
  }
  redirect(`${listPath(world)}/${copy.id}?notice=duplicated`);
}
