import { z } from 'zod';
import { fieldsSchema } from '@/lib/fields/fields';
import { sanitizeBody, validateBody, type DocNode } from '@/lib/snippets/body';
import { MAX_ALIASES, MAX_ALIAS_LENGTH, MAX_TAGS, MAX_TAG_LENGTH } from '@/lib/snippets/labels';

/**
 * Formato di esportazione del mondo (JSON, versione 1). Documentato in `docs/export-format.md`.
 * Gli id del database non compaiono: snippet e categorie sono identificati da riferimenti ordinali
 * (`s1`, `c1`, ...) e il documento non contiene date di esportazione, così esportare, importare e
 * riesportare produce lo stesso file.
 */
export const EXPORT_FORMAT = 'worldloom.world';
export const EXPORT_VERSION = 1;
export const MAX_EXPORT_SNIPPETS = 5000;
const MAX_CATEGORIES = 200;
const MAX_RELATIONS = 50_000;
const MAX_TYPES = 500;
const MAX_FIELDS_LENGTH = 100_000;

// Righe come le legge il database (nomi delle colonne).
export type RawWorld = {
  world: { name: string };
  categories: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    fields_schema: unknown;
    content_template: unknown;
  }[];
  snippets: {
    id: string;
    title: string;
    status: 'draft' | 'final';
    visibility: Visibility;
    archived_at: string | null;
    deleted_at: string | null;
    tags: string[];
    aliases: string[];
    fields: unknown;
    body: unknown;
    created_at: string;
    category_ids: string[];
  }[];
  relationTypes: {
    label: string;
    inverse_label: string | null;
    source_category_id: string | null;
    target_category_id: string | null;
  }[];
  relations: {
    source_id: string;
    target_id: string;
    label: string;
    inverse_label: string | null;
    notes: string;
    valid_from: unknown;
    valid_to: unknown;
    from_mention: boolean;
    visibility: Visibility;
    created_at: string;
  }[];
};

const VISIBILITIES = ['secret', 'shared', 'members', 'public'] as const;
type Visibility = (typeof VISIBILITIES)[number];

const ref = (prefix: string) => z.string().regex(new RegExp(`^${prefix}[1-9][0-9]{0,5}$`));
const date = z.iso.datetime({ offset: true });
const label = z.string().trim().min(1).max(120);
const time = z.object({
  calendar: z.literal('default'),
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
});

const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  world: z.object({ name: z.string().trim().min(1).max(120) }),
  categories: z
    .array(
      z.object({
        ref: ref('c'),
        name: z.string().trim().min(1).max(80),
        icon: z.string().max(60).nullable(),
        color: z.string().max(40).nullable(),
        fieldsSchema: fieldsSchema,
        contentTemplate: z.null(),
      }),
    )
    .max(MAX_CATEGORIES),
  snippets: z
    .array(
      z.object({
        ref: ref('s'),
        title: z.string().trim().min(1).max(300),
        status: z.enum(['draft', 'final']),
        visibility: z.enum(VISIBILITIES),
        archived: z.boolean(),
        tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS),
        aliases: z.array(z.string().min(1).max(MAX_ALIAS_LENGTH)).max(MAX_ALIASES),
        categories: z.array(ref('c')).max(MAX_CATEGORIES),
        fields: z
          .record(z.string(), z.unknown())
          .refine((v) => JSON.stringify(v).length <= MAX_FIELDS_LENGTH, 'campi troppo grandi'),
        body: z.unknown(),
        createdAt: date,
      }),
    )
    .max(MAX_EXPORT_SNIPPETS),
  relationTypes: z
    .array(
      z.object({
        label,
        inverseLabel: label.nullable(),
        sourceCategory: ref('c').nullable(),
        targetCategory: ref('c').nullable(),
      }),
    )
    .max(MAX_TYPES),
  relations: z
    .array(
      z.object({
        source: ref('s'),
        target: ref('s'),
        label,
        inverseLabel: label.nullable(),
        notes: z.string().max(2000),
        validFrom: time.nullable(),
        validTo: time.nullable(),
        fromMention: z.boolean(),
        visibility: z.enum(VISIBILITIES),
        createdAt: date,
      }),
    )
    .max(MAX_RELATIONS),
});

export type WorldExport = z.infer<typeof exportSchema>;

const iso = (value: string) => new Date(value).toISOString();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Copia con le chiavi degli oggetti in ordine alfabetico: Postgres riordina le chiavi jsonb, l'export no. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => byText(a, b))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

/** Toglie i nodi immagine: i file restano nel mondo di origine e nel nuovo mondo sarebbero riferimenti rotti. */
function dropImages(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node
      .filter(
        (child) =>
          !(
            typeof child === 'object' &&
            child !== null &&
            (child as { type?: unknown }).type === 'image'
          ),
      )
      .map(dropImages);
  }
  if (typeof node === 'object' && node !== null) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === 'content' ? dropImages(value) : value,
      ]),
    );
  }
  return node;
}

/** Riscrive gli id delle menzioni con `map`; le menzioni senza destinazione vengono tolte. */
function mapMentions(node: unknown, map: (id: string) => string | null): unknown {
  if (Array.isArray(node)) {
    return node.flatMap((child) => {
      if (
        typeof child === 'object' &&
        child !== null &&
        (child as { type?: unknown }).type === 'mention'
      ) {
        const attrs = (child as { attrs?: { id?: unknown } }).attrs;
        const target = typeof attrs?.id === 'string' ? map(attrs.id) : null;
        return target ? [{ ...child, attrs: { ...attrs, id: target } }] : [];
      }
      return [mapMentions(child, map)];
    });
  }
  if (typeof node === 'object' && node !== null) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === 'content' ? mapMentions(value, map) : value,
      ]),
    );
  }
  return node;
}

/** Costruisce il documento di esportazione dalle righe lette con i permessi di chi esporta. */
export function buildExport(raw: RawWorld): WorldExport {
  const categories = [...raw.categories].sort(
    (a, b) => byText(a.name, b.name) || byText(a.id, b.id),
  );
  const categoryRef = new Map(categories.map((c, i) => [c.id, `c${i + 1}`]));

  const snippets = raw.snippets
    .filter((s) => s.deleted_at === null)
    .sort(
      (a, b) =>
        byText(iso(a.created_at), iso(b.created_at)) ||
        byText(a.title, b.title) ||
        byText(a.id, b.id),
    );
  const snippetRef = new Map(snippets.map((s, i) => [s.id, `s${i + 1}`]));

  const relations = raw.relations
    .flatMap((r) => {
      const source = snippetRef.get(r.source_id);
      const target = snippetRef.get(r.target_id);
      return source && target ? [{ r, source, target }] : [];
    })
    .sort(
      (a, b) =>
        byText(iso(a.r.created_at), iso(b.r.created_at)) ||
        byText(a.source, b.source) ||
        byText(a.target, b.target) ||
        byText(a.r.label, b.r.label),
    );

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    world: { name: raw.world.name },
    categories: categories.map((c) => ({
      ref: categoryRef.get(c.id) as string,
      name: c.name,
      icon: c.icon,
      color: c.color,
      fieldsSchema: sortKeys(c.fields_schema) as WorldExport['categories'][number]['fieldsSchema'],
      // Il modello di contenuto non è ancora usato dall'app: si esporta sempre nullo (v1) e l'import lo esige nullo.
      contentTemplate: null,
    })),
    snippets: snippets.map((s) => ({
      ref: snippetRef.get(s.id) as string,
      title: s.title,
      status: s.status,
      visibility: s.visibility,
      archived: s.archived_at !== null,
      tags: s.tags,
      aliases: s.aliases,
      categories: s.category_ids
        .flatMap((id) => categoryRef.get(id) ?? [])
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
      fields:
        typeof s.fields === 'object' && s.fields !== null && !Array.isArray(s.fields)
          ? (sortKeys(s.fields) as Record<string, unknown>)
          : {},
      body: sortKeys(mapMentions(sanitizeBody(s.body), (id) => snippetRef.get(id) ?? null)),
      createdAt: iso(s.created_at),
    })),
    relationTypes: [...raw.relationTypes]
      .sort((a, b) => byText(a.label, b.label))
      .map((t) => ({
        label: t.label,
        inverseLabel: t.inverse_label,
        sourceCategory: t.source_category_id
          ? (categoryRef.get(t.source_category_id) ?? null)
          : null,
        targetCategory: t.target_category_id
          ? (categoryRef.get(t.target_category_id) ?? null)
          : null,
      })),
    relations: relations.map(({ r, source, target }) => ({
      source,
      target,
      label: r.label,
      inverseLabel: r.inverse_label,
      notes: r.notes,
      validFrom: sortKeys(r.valid_from ?? null) as WorldExport['relations'][number]['validFrom'],
      validTo: sortKeys(r.valid_to ?? null) as WorldExport['relations'][number]['validTo'],
      fromMention: r.from_mention,
      visibility: r.visibility,
      createdAt: iso(r.created_at),
    })),
  };
}

export type ParseResult = { ok: true; data: WorldExport } | { ok: false; error: string };

const duplicates = (refs: string[]) => new Set(refs).size !== refs.length;

/** Valida struttura, limiti e coerenza dei riferimenti. */
export function parseExport(input: unknown): ParseResult {
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') || 'documento'}: ${issue?.message ?? ''}` };
  }
  const d = parsed.data;
  const cats = new Set(d.categories.map((c) => c.ref));
  const snips = new Set(d.snippets.map((s) => s.ref));
  if (duplicates(d.categories.map((c) => c.ref)) || duplicates(d.snippets.map((s) => s.ref))) {
    return { ok: false, error: 'riferimenti duplicati' };
  }
  const bad =
    d.snippets.some((s) => s.categories.some((c) => !cats.has(c))) ||
    d.relationTypes.some(
      (t) =>
        (t.sourceCategory !== null && !cats.has(t.sourceCategory)) ||
        (t.targetCategory !== null && !cats.has(t.targetCategory)),
    ) ||
    d.relations.some((r) => !snips.has(r.source) || !snips.has(r.target) || r.source === r.target);
  return bad
    ? { ok: false, error: 'riferimento a un elemento inesistente' }
    : { ok: true, data: d };
}

export type ImportPlan =
  | {
      ok: true;
      world: { name: string };
      categories: RawWorld['categories'];
      snippets: Omit<RawWorld['snippets'][number], 'deleted_at' | 'category_ids'>[];
      snippetCategories: { snippet_id: string; category_id: string }[];
      relationTypes: RawWorld['relationTypes'];
      relations: RawWorld['relations'];
    }
  | { ok: false; error: string };

/**
 * Trasforma un export valido in righe pronte per l'inserimento, con id nuovi. Ogni corpo passa da
 * `validateBody` (sanificazione); un corpo non valido fa fallire l'importazione, mai sostituito da uno vuoto.
 */
export function planImport(data: WorldExport, newId: () => string): ImportPlan {
  const categoryId = new Map(data.categories.map((c) => [c.ref, newId()]));
  const snippetId = new Map(data.snippets.map((s) => [s.ref, newId()]));

  const snippets: Extract<ImportPlan, { ok: true }>['snippets'] = [];
  for (const s of data.snippets) {
    const remapped = mapMentions(dropImages(s.body), (ref) => snippetId.get(ref) ?? null);
    const body: DocNode | null = validateBody(remapped);
    if (!body) return { ok: false, error: `${s.ref}: testo non valido` };
    snippets.push({
      id: snippetId.get(s.ref) as string,
      title: s.title,
      status: s.status,
      visibility: s.visibility,
      archived_at: s.archived ? new Date(s.createdAt).toISOString() : null,
      tags: s.tags,
      aliases: s.aliases,
      fields: s.fields,
      body,
      created_at: s.createdAt,
    });
  }

  return {
    ok: true,
    world: { name: data.world.name },
    categories: data.categories.map((c) => ({
      id: categoryId.get(c.ref) as string,
      name: c.name,
      icon: c.icon,
      color: c.color,
      fields_schema: c.fieldsSchema,
      content_template: null,
    })),
    snippets,
    snippetCategories: data.snippets.flatMap((s) =>
      s.categories.map((c) => ({
        snippet_id: snippetId.get(s.ref) as string,
        category_id: categoryId.get(c) as string,
      })),
    ),
    relationTypes: data.relationTypes.map((t) => ({
      label: t.label,
      inverse_label: t.inverseLabel,
      source_category_id: t.sourceCategory ? (categoryId.get(t.sourceCategory) ?? null) : null,
      target_category_id: t.targetCategory ? (categoryId.get(t.targetCategory) ?? null) : null,
    })),
    relations: data.relations.map((r) => ({
      source_id: snippetId.get(r.source) as string,
      target_id: snippetId.get(r.target) as string,
      label: r.label,
      inverse_label: r.inverseLabel,
      notes: r.notes,
      valid_from: r.validFrom,
      valid_to: r.validTo,
      from_mention: r.fromMention,
      visibility: r.visibility,
      created_at: r.createdAt,
    })),
  };
}
