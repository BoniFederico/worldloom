'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { fieldsSchema, validateSnippetFields, type FieldDefinition } from '@/lib/fields/fields';
import type { Json } from '@/lib/supabase/database.types';
import {
  MAX_JSON_LENGTH,
  MAX_TEXT_LENGTH,
  docToText,
  mentionsOf,
  textToDoc,
  validateBody,
  type DocNode,
} from '@/lib/snippets/body';
import { EDITABLE_TYPES, mergeFieldInput } from '@/lib/snippets/form';
import { parseAliases, parseTags } from '@/lib/snippets/labels';
import { snippetTitleSchema } from '@/lib/snippets/schemas';
import type { SaveState, SnippetDraft } from '@/lib/snippets/state';
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

function draftOf(formData: FormData): SnippetDraft {
  const fields: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith('f:') && typeof value === 'string') fields[name] = value;
  }
  return {
    title: field(formData, 'title'),
    status: field(formData, 'status'),
    body: field(formData, 'body'),
    bodyJson: field(formData, 'body_json'),
    tags: field(formData, 'tags'),
    aliases: field(formData, 'aliases'),
    categories: formData.getAll('category').map(String),
    fields,
  };
}

/**
 * Salva lo snippet. Se qualcosa non va restituisce l'errore insieme a quanto l'utente ha digitato,
 * così il form non perde nulla; se va a buon fine fa `redirect`.
 */
export async function saveSnippet(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const draft = draftOf(formData);
  const fail = (error: string, keys: string[] = []): SaveState => ({
    error,
    keys,
    draft,
    nonce: Date.now(),
  });

  const title = snippetTitleSchema.safeParse(draft.title);
  if (!title.success) return fail('invalid_title');
  const status = STATUSES.find((s) => s === draft.status) ?? 'draft';
  const token = field(formData, 'updated');
  const text = draft.body.replace(/\r\n?/g, '\n');
  if (text.length > MAX_TEXT_LENGTH || draft.bodyJson.length > MAX_JSON_LENGTH) {
    return fail('body_too_large');
  }
  // Con l'editor arriva `body_json`: un documento valido, oppure un errore. Mai un ripiego vuoto.
  let richBody: DocNode | null = null;
  if (formData.has('body_json')) {
    try {
      richBody = validateBody(JSON.parse(draft.bodyJson));
    } catch {
      richBody = null;
    }
    if (!richBody) return fail('invalid_body');
  }
  const tags = parseTags(draft.tags);
  const aliases = parseAliases(draft.aliases);
  if (!tags.ok || !aliases.ok) return fail('invalid_labels');
  const chosen = [...new Set(draft.categories)].filter((c) => uuidSchema.safeParse(c).success);

  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) return fail('forbidden');

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
  if (row.updated_at !== token) return fail('conflict');

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
  // Un campo obbligatorio di un tipo che questo form non sa modificare non deve bloccare lo stato definitivo.
  const enforceable = defs.map((d) =>
    EDITABLE_TYPES.includes(d.type) ? d : { ...d, required: false },
  );
  const checked = validateSnippetFields(enforceable, merged, {
    enforceRequired: status === 'final',
  });
  const badKeys = Object.keys(checked.errors);
  if (badKeys.length) return fail('invalid_fields', badKeys);

  // Un riferimento deve puntare a un altro snippet attivo dello stesso mondo, come l'elenco della pagina.
  const refKeys = defs.filter((d) => d.type === 'snippet_ref' && d.key in checked.values);
  if (refKeys.length) {
    const wanted = [...new Set(refKeys.map((d) => String(checked.values[d.key])))];
    const { data: found } = await supabase
      .from('snippets')
      .select('id')
      .eq('world_id', world)
      .is('deleted_at', null)
      .neq('id', id)
      .in('id', wanted);
    const known = new Set((found ?? []).map((s) => s.id));
    const missing = refKeys.filter((d) => !known.has(String(checked.values[d.key])));
    if (missing.length)
      return fail(
        'invalid_fields',
        missing.map((d) => d.key),
      );
  }

  // Il corpo si aggiorna solo se il testo è cambiato: altrimenti resta il documento esistente, com'è.
  // Con l'editor arriva il documento (sanificato qui); senza JavaScript arriva il testo semplice.
  const body: Json = richBody
    ? (richBody as unknown as Json)
    : text.trim() === docToText(row.body).trim()
      ? row.body
      : (textToDoc(text) as unknown as Json);

  const { error } = await supabase.rpc('save_snippet', {
    p_id: id,
    p_updated: token,
    p_title: title.data,
    p_status: status,
    p_body: body,
    p_fields: checked.values as unknown as Json,
    p_categories: validCategories,
    p_tags: tags.values,
    p_aliases: aliases.values,
    p_mentions: mentionsOf(body),
  });
  if (error) {
    return fail(
      error.message === 'conflict' || error.message === 'invalid_labels'
        ? error.message
        : 'generic',
    );
  }
  redirect(`${listPath(world)}/${id}?notice=saved`);
}

export type AutosaveResult =
  | { ok: true; updated: string }
  | { ok: false; error: 'conflict' | 'invalid' | 'forbidden' | 'generic' };

/**
 * Salvataggio automatico del solo corpo. Come il salvataggio completo è condizionato a `updated_at`
 * e restituisce il nuovo valore, che il client usa per i salvataggi successivi.
 */
export async function autosaveBody(input: {
  world: string;
  id: string;
  updated: string;
  doc: unknown;
}): Promise<AutosaveResult> {
  const world = uuidSchema.safeParse(input.world);
  const id = uuidSchema.safeParse(input.id);
  if (!world.success || !id.success || typeof input.updated !== 'string') {
    return { ok: false, error: 'invalid' };
  }
  // Un documento non valido o oltre i limiti non si scrive: sostituirlo con uno vuoto cancellerebbe il corpo.
  const doc = validateBody(input.doc);
  if (!doc) return { ok: false, error: 'invalid' };

  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) return { ok: false, error: 'forbidden' };
  const { data, error } = await supabase.rpc('autosave_snippet_body', {
    p_id: id.data,
    p_updated: input.updated,
    p_body: doc as unknown as Json,
    p_mentions: mentionsOf(doc),
  });
  if (error) return { ok: false, error: error.message === 'conflict' ? 'conflict' : 'generic' };
  return typeof data === 'string' ? { ok: true, updated: data } : { ok: false, error: 'generic' };
}

type Patch = { archived_at?: string | null; deleted_at?: string | null };

/** Le azioni di stato valgono per gli snippet attivi; il ripristino solo per quelli nel cestino. */
async function setState(
  formData: FormData,
  patch: Patch,
  notice: string,
  to: 'list' | 'back',
  inTrash = false,
) {
  const world = worldOf(formData);
  const id = snippetOf(formData, world);
  const back = `${listPath(world)}/${id}`;
  const { supabase, canWrite } = await loadWorld(world);
  if (!canWrite) redirect(`${back}?error=forbidden`);
  const base = supabase.from('snippets').update(patch).eq('id', id).eq('world_id', world);
  const { data, error } = await (
    inTrash ? base.not('deleted_at', 'is', null) : base.is('deleted_at', null)
  ).select('id');
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
  return setState(formData, { deleted_at: null }, 'restored', 'back', true);
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
  const suffix = t('copySuffix');
  const { data: copy, error } = await supabase
    .from('snippets')
    .insert({
      world_id: world,
      created_by: auth.user.id,
      title: `${source.title.slice(0, 300 - suffix.length)}${suffix}`,
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
    const { error: catError } = await supabase
      .from('snippet_categories')
      .insert(
        cats.map((c) => ({ world_id: world, snippet_id: copy.id, category_id: c.category_id })),
      );
    if (catError) {
      // Una copia a metà (senza categorie) è peggio di nessuna copia.
      await supabase.from('snippets').delete().eq('id', copy.id);
      redirect(`${back}?error=generic`);
    }
  }
  redirect(`${listPath(world)}/${copy.id}?notice=duplicated`);
}

export type MentionTarget = { id: string; title: string; aliases: string[] };

/**
 * Snippet che si possono menzionare da `snippetId`: attivi, dello stesso mondo, esclusi se stesso (i non leggibili non
 * compaiono per la RLS). Il client filtra per titolo e alias mentre si digita; con mondi molto grandi lo sostituirà la ricerca (#19).
 */
export async function listMentionTargets(input: {
  world: string;
  id: string;
}): Promise<MentionTarget[]> {
  const world = uuidSchema.safeParse(input.world);
  const id = uuidSchema.safeParse(input.id);
  if (!world.success || !id.success) return [];
  const { supabase, canWrite } = await loadWorld(world.data);
  if (!canWrite) return [];
  const { data } = await supabase
    .from('snippets')
    .select('id, title, aliases')
    .eq('world_id', world.data)
    .is('deleted_at', null)
    .neq('id', id.data)
    .order('title')
    .limit(500);
  return data ?? [];
}
