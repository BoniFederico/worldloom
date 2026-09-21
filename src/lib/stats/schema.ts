import { z } from 'zod';
import { FUNCTION_NAMES, parseFormula, type FormulaErrorCode } from './formula';
import { MAX_JSON_LENGTH, parseJsonWithPositions, type Pos } from './json-locate';

/**
 * Schema di statistiche di una campagna (#33, SPEC «Schema di statistiche»). Un documento JSON versionato; la forma è
 * descritta anche da `stats.schema.json` (JSON Schema, controlla la sola struttura). Qui sopra la struttura c'è la
 * semantica: chiavi uniche, formule valide e senza cicli, riferimenti esistenti.
 *
 * Nomi che le formule possono usare: ogni attributo e ogni derivato per chiave; ogni risorsa `pool` come `<chiave>_max`
 * (il massimo). Le formule dei derivati e dei massimi vedono attributi e derivati; le risorse correnti non compaiono.
 */

export const SCHEMA_VERSION = 1;
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
export const MAX_FIELDS = 200;

const key = z.string().regex(KEY_PATTERN);
const label = z.string().trim().min(1).max(80);
const formula = z.string().max(500);
const finiteNumber = z.number().refine(Number.isFinite);

const attribute = z.strictObject({
  key,
  label,
  type: z.enum(['integer', 'number']),
  min: finiteNumber.optional(),
  max: finiteNumber.optional(),
  default: finiteNumber.optional(),
});
const derived = z.strictObject({ key, label, formula });
const resource = z.strictObject({
  key,
  label,
  type: z.literal('pool'),
  max: finiteNumber.optional(),
  maxFormula: formula.optional(),
});
const itemType = z.enum(['text', 'integer', 'number']);
const list = z.strictObject({
  key,
  label,
  item: z
    .record(key, itemType)
    .refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 12),
});
const text = z.strictObject({ key, label });
const section = z.strictObject({
  section: label,
  fields: z.array(key).max(MAX_FIELDS),
});

const statsSchemaZod = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: label,
  description: z.string().max(500).optional(),
  attributes: z.array(attribute).max(MAX_FIELDS).default([]),
  derived: z.array(derived).max(MAX_FIELDS).default([]),
  resources: z.array(resource).max(MAX_FIELDS).default([]),
  lists: z.array(list).max(MAX_FIELDS).default([]),
  text: z.array(text).max(MAX_FIELDS).default([]),
  layout: z.array(section).max(MAX_FIELDS).default([]),
});

export type StatsSchema = z.infer<typeof statsSchemaZod>;
export type Attribute = z.infer<typeof attribute>;

export type StatsErrorCode =
  | 'too_large'
  | 'json_syntax'
  | 'required'
  | 'invalid_type'
  | 'invalid_value'
  | 'invalid_key'
  | 'out_of_range'
  | 'unknown_field'
  | 'unsupported_version'
  | 'duplicate_key'
  | 'reserved_key'
  | 'invalid_range'
  | 'max_required'
  | 'max_conflict'
  | 'formula'
  | 'unknown_reference'
  | 'formula_cycle'
  | 'too_many_fields';

export type StatsError = {
  code: StatsErrorCode;
  /** Percorso del campo, per esempio `attributes[1].key` (vuoto per il documento intero). */
  path: string;
  /** Nome del campo (ultimo pezzo del percorso). */
  field: string;
  line?: number;
  column?: number;
  /** Dettaglio: il codice dell'errore di formula, il nome che non esiste, ecc. */
  detail?: string;
  /** Posizione dentro la formula (0-based), per gli errori di formula. */
  index?: number;
};

export type StatsResult =
  { ok: true; schema: StatsSchema; derivedOrder: string[] } | { ok: false; errors: StatsError[] };

const lastSegment = (path: string) =>
  path
    .replace(/\[\d+\]$/, '')
    .split('.')
    .pop() ?? '';
const pathOf = (parts: readonly PropertyKey[]) =>
  parts.reduce<string>(
    (acc, p) =>
      typeof p === 'number' ? `${acc}[${p}]` : acc === '' ? String(p) : `${acc}.${String(p)}`,
    '',
  );

/** `a.b[2].c` → `a.b[2]` → `a.b` → `a` → `` */
const parentPath = (path: string) => {
  const cut = Math.max(path.lastIndexOf('.'), path.lastIndexOf('['));
  return cut < 0 ? '' : path.slice(0, cut);
};

type Locate = (path: string) => Pos | undefined;

function makeError(
  code: StatsErrorCode,
  path: string,
  locate: Locate,
  extra: { detail?: string; index?: number; onKey?: boolean } = {},
): StatsError {
  // Un campo mancante non ha posizione: si punta al più vicino contenitore che ce l'ha.
  let pos = extra.onKey ? locate(`${path}#key`) : undefined;
  for (let at = path; !pos; at = parentPath(at)) {
    pos = locate(at);
    if (at === '') break;
  }
  const error: StatsError = { code, path, field: lastSegment(path) };
  if (pos) {
    error.line = pos.line;
    error.column = pos.column;
  }
  if (extra.detail !== undefined) error.detail = extra.detail;
  if (extra.index !== undefined) error.index = extra.index;
  return error;
}

/** Errori strutturali (Zod) → errori con codice stabile. Per un percorso mancante si punta al genitore. */
function structureErrors(issues: z.core.$ZodIssue[], locate: Locate): StatsError[] {
  const errors: StatsError[] = [];
  for (const issue of issues) {
    const path = pathOf(issue.path);
    const known = (code: StatsErrorCode, p = path, extra = {}) =>
      errors.push(makeError(code, p, locate, extra));
    switch (issue.code) {
      case 'unrecognized_keys':
        for (const k of issue.keys)
          known('unknown_field', path === '' ? k : `${path}.${k}`, { onKey: true });
        break;
      case 'invalid_type':
        known(/received undefined/.test(issue.message) ? 'required' : 'invalid_type');
        break;
      case 'invalid_value':
        known(path === 'schemaVersion' ? 'unsupported_version' : 'invalid_value');
        break;
      case 'invalid_format':
        known(
          lastSegment(path) === 'key' || /\.fields\[\d+\]$/.test(path)
            ? 'invalid_key'
            : 'invalid_value',
        );
        break;
      case 'too_big':
      case 'too_small':
        known(
          issue.code === 'too_big' && issue.origin === 'array' ? 'too_many_fields' : 'out_of_range',
        );
        break;
      default:
        known('invalid_value');
    }
  }
  return errors;
}

const NUMERIC_SECTIONS = ['attributes', 'derived'] as const;

/** Chi ha già usato ogni nome: chiavi delle sezioni e `<risorsa>_max`. */
function semanticErrors(
  schema: StatsSchema,
  locate: Locate,
): { errors: StatsError[]; order: string[] } {
  const errors: StatsError[] = [];
  const add = (code: StatsErrorCode, path: string, extra: Parameters<typeof makeError>[3] = {}) =>
    errors.push(makeError(code, path, locate, extra));

  // Chiavi uniche in tutto lo schema (attributi, derivati, risorse, liste, testi) e nomi di formula liberi.
  const owners = new Map<string, string>();
  const claim = (name: string, path: string) => {
    if ((FUNCTION_NAMES as readonly string[]).includes(name))
      add('reserved_key', path, { detail: name });
    else if (owners.has(name)) add('duplicate_key', path, { detail: name });
    else owners.set(name, path);
  };
  const sections = ['attributes', 'derived', 'resources', 'lists', 'text'] as const;
  for (const s of sections) {
    schema[s].forEach((f, n) => claim(f.key, `${s}[${n}].key`));
  }
  schema.resources.forEach((r, n) => claim(`${r.key}_max`, `resources[${n}].key`));

  schema.attributes.forEach((a, n) => {
    const p = `attributes[${n}]`;
    if (a.min !== undefined && a.max !== undefined && a.min > a.max)
      add('invalid_range', `${p}.min`);
    if (a.default !== undefined) {
      const below = a.min !== undefined && a.default < a.min;
      const above = a.max !== undefined && a.default > a.max;
      if (below || above || (a.type === 'integer' && !Number.isInteger(a.default))) {
        add('invalid_range', `${p}.default`);
      }
    }
    for (const bound of ['min', 'max'] as const) {
      const v = a[bound];
      if (a.type === 'integer' && v !== undefined && !Number.isInteger(v))
        add('invalid_range', `${p}.${bound}`);
    }
  });

  // Formule: sintassi e riferimenti. Derivati e massimi vedono attributi e derivati.
  const numeric = new Set<string>(NUMERIC_SECTIONS.flatMap((s) => schema[s].map((f) => f.key)));
  const deps = new Map<string, string[]>();
  const check = (src: string, path: string): string[] => {
    const parsed = parseFormula(src);
    if (!parsed.ok) {
      add('formula', path, {
        detail: parsed.error.code satisfies FormulaErrorCode,
        index: parsed.error.index,
      });
      return [];
    }
    parsed.refs.forEach((ref, n) => {
      if (!numeric.has(ref))
        add('unknown_reference', path, { detail: ref, index: parsed.refAt[n]! });
    });
    return parsed.refs.filter((r) => numeric.has(r));
  };
  schema.derived.forEach((d, n) => deps.set(d.key, check(d.formula, `derived[${n}].formula`)));
  schema.resources.forEach((r, n) => {
    const p = `resources[${n}]`;
    if (r.max === undefined && r.maxFormula === undefined) add('max_required', p);
    else if (r.max !== undefined && r.maxFormula !== undefined) add('max_conflict', p);
    else if (r.max !== undefined && r.max < 0) add('invalid_range', `${p}.max`);
    if (r.maxFormula !== undefined) check(r.maxFormula, `${p}.maxFormula`);
  });

  // Ordine di calcolo dei derivati (dipendenze prima) e cicli.
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const derivedIndex = new Map(schema.derived.map((d, n) => [d.key, n]));
  const visit = (k: string): boolean => {
    const s = state.get(k);
    if (s === 'done') return true;
    if (s === 'visiting') return false;
    state.set(k, 'visiting');
    for (const dep of deps.get(k) ?? []) {
      if (derivedIndex.has(dep) && !visit(dep)) return false;
    }
    state.set(k, 'done');
    order.push(k);
    return true;
  };
  for (const d of schema.derived) {
    if (state.get(d.key) === undefined && !visit(d.key)) {
      add('formula_cycle', `derived[${derivedIndex.get(d.key)}].formula`, { detail: d.key });
      break;
    }
  }

  // Layout: solo chiavi di campi veri (non i nomi `<risorsa>_max`).
  const fieldKeys = new Set(sections.flatMap((s) => schema[s].map((f) => f.key)));
  schema.layout.forEach((sec, n) =>
    sec.fields.forEach((f, m) => {
      if (!fieldKeys.has(f)) add('unknown_reference', `layout[${n}].fields[${m}]`, { detail: f });
    }),
  );
  return { errors, order };
}

/** Valida un documento già letto (senza posizioni di riga). */
export function validateStatsValue(value: unknown, locate: Locate = () => undefined): StatsResult {
  const parsed = statsSchemaZod.safeParse(value);
  if (!parsed.success) return { ok: false, errors: structureErrors(parsed.error.issues, locate) };
  const { errors, order } = semanticErrors(parsed.data, locate);
  if (errors.length) return { ok: false, errors };
  return { ok: true, schema: parsed.data, derivedOrder: order };
}

/** Valida il testo JSON di uno schema: errori con riga, colonna e campo. */
export function validateStatsText(text: string): StatsResult {
  if (text.length > MAX_JSON_LENGTH) {
    return { ok: false, errors: [{ code: 'too_large', path: '', field: '' }] };
  }
  const json = parseJsonWithPositions(text);
  if (!json.ok) {
    return {
      ok: false,
      errors: [
        {
          code: 'json_syntax',
          path: '',
          field: '',
          line: json.error.line,
          column: json.error.column,
        },
      ],
    };
  }
  return validateStatsValue(json.value, json.at);
}
