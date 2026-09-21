import { z } from 'zod';

export const FIELD_TYPES = [
  'text',
  'number',
  'date',
  'calendar_date',
  'choice',
  'snippet_ref',
  'coordinates',
  'image',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_TEXT = 10_000;

export const fieldDefinitionSchema = z
  .object({
    key: z.string().regex(KEY),
    label: z.string().trim().min(1).max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    options: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });
    if (d.type === 'choice') {
      if (!d.options) issue('options richieste', 'options');
      else if (new Set(d.options).size !== d.options.length) issue('opzioni duplicate', 'options');
    } else if (d.options) {
      issue('options solo per le scelte', 'options');
    }
    if (d.type !== 'number' && (d.min !== undefined || d.max !== undefined)) {
      issue('min/max solo per i numeri', 'min');
    }
    if (d.min !== undefined && d.max !== undefined && d.min > d.max) issue('min > max', 'min');
  });
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldsSchema = z
  .array(fieldDefinitionSchema)
  .max(60)
  .superRefine((defs, ctx) => {
    const seen = new Set<string>();
    defs.forEach((d, i) => {
      if (seen.has(d.key))
        ctx.addIssue({ code: 'custom', message: 'chiave duplicata', path: [i, 'key'] });
      seen.add(d.key);
    });
  });

const uuid = z.uuid();

const calendarDate = z.object({
  calendar: z.string().min(1).max(64),
  year: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  month: z.number().int().min(1).max(40),
  day: z.number().int().min(1).max(500),
  era: z.string().max(64).optional(),
});

const coordinates = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  map: uuid.optional(),
});

// Percorso relativo dello storage a whitelist: segmenti non vuoti di [A-Za-z0-9_-.] che non iniziano
// con un punto (quindi niente `.`/`..`), senza URL, backslash, percent-encoding o caratteri di controllo.
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const imagePath = z
  .string()
  .max(300)
  .refine((p) => p.split('/').every((segment) => SEGMENT.test(segment)));
const image = z.object({ path: imagePath, alt: z.string().max(300).optional() });

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export type ValueResult = { ok: true; value: unknown } | { ok: false; error: 'invalid' };

const ok = (value: unknown): ValueResult => ({ ok: true, value });
const invalid: ValueResult = { ok: false, error: 'invalid' };
const fromSchema = (schema: z.ZodType, value: unknown): ValueResult => {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : invalid;
};

export function validateValue(def: FieldDefinition, value: unknown): ValueResult {
  switch (def.type) {
    case 'text':
      return typeof value === 'string' && value.length <= MAX_TEXT ? ok(value) : invalid;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return invalid;
      if (def.min !== undefined && value < def.min) return invalid;
      if (def.max !== undefined && value > def.max) return invalid;
      return ok(value);
    case 'date':
      return typeof value === 'string' && isRealIsoDate(value) ? ok(value) : invalid;
    case 'calendar_date':
      return fromSchema(calendarDate, value);
    case 'choice':
      return typeof value === 'string' && def.options?.includes(value) ? ok(value) : invalid;
    case 'snippet_ref':
      return fromSchema(uuid, value);
    case 'coordinates':
      return fromSchema(coordinates, value);
    case 'image':
      return fromSchema(image, value);
  }
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

export type SnippetFieldsResult = {
  values: Record<string, unknown>;
  errors: Record<string, 'invalid' | 'required'>;
};

/**
 * Valida i valori di uno snippet contro i campi delle sue categorie. I valori di chiavi che nessuna
 * categoria definisce restano intatti: cambiare categoria non deve mai far perdere dati.
 */
export function validateSnippetFields(
  defs: FieldDefinition[],
  input: Record<string, unknown>,
  options: { enforceRequired: boolean },
): SnippetFieldsResult {
  const values: Record<string, unknown> = {};
  const errors: SnippetFieldsResult['errors'] = {};
  const seen = new Set<string>();

  for (const def of defs) {
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    const raw = input[def.key];
    if (isEmpty(raw)) {
      if (def.required && options.enforceRequired) errors[def.key] = 'required';
      continue;
    }
    const result = validateValue(def, raw);
    if (result.ok) values[def.key] = result.value;
    else errors[def.key] = 'invalid';
  }
  for (const [key, raw] of Object.entries(input)) {
    if (!seen.has(key) && !isEmpty(raw)) values[key] = raw;
  }
  return { values, errors };
}

/** Ricava una chiave stabile e univoca da un'etichetta (es. «Età» → `eta`). */
export function keyFromLabel(label: string, existing: string[] = []): string {
  let base = label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'campo';
  if (!/^[a-z]/.test(base)) base = `campo_${base}`;
  base = base.slice(0, 40).replace(/_+$/, '');

  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
