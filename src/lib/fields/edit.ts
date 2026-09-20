import {
  FIELD_TYPES,
  fieldDefinitionSchema,
  fieldsSchema,
  keyFromLabel,
  type FieldDefinition,
  type FieldType,
} from './fields';

export type FieldInput = Record<string, string | undefined>;
export type FieldFromInput = { ok: true; field: FieldDefinition } | { ok: false };

const isFieldType = (value: string | undefined): value is FieldType =>
  FIELD_TYPES.some((t) => t === value);

/** Legge un numero opzionale da un campo di form: vuoto → `undefined`, non numerico → `NaN`. */
function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return Number(value);
}

/** Costruisce e valida un campo a partire dai valori grezzi di un form (opzioni una per riga). */
export function fieldFromInput(input: FieldInput, existingKeys: string[]): FieldFromInput {
  const label = (input.label ?? '').trim();
  if (!label || !isFieldType(input.type)) return { ok: false };

  const field: FieldDefinition = {
    key: keyFromLabel(label, existingKeys),
    label,
    type: input.type,
  };
  if (input.required === 'on') field.required = true;
  if (input.type === 'choice') {
    field.options = (input.options ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (input.type === 'number') {
    const min = optionalNumber(input.min);
    const max = optionalNumber(input.max);
    if (min !== undefined) field.min = min;
    if (max !== undefined) field.max = max;
  }

  const parsed = fieldDefinitionSchema.safeParse(field);
  return parsed.success ? { ok: true, field: parsed.data } : { ok: false };
}

export function addField(defs: FieldDefinition[], field: FieldDefinition): FieldDefinition[] {
  return fieldsSchema.parse([...defs, field]);
}

export type FieldPatch = Partial<
  Pick<FieldDefinition, 'label' | 'required' | 'options' | 'min' | 'max'>
>;

/** Modifica etichetta e vincoli. La chiave (che indicizza i valori degli snippet) e il tipo restano fissi. */
export function updateField(
  defs: FieldDefinition[],
  key: string,
  patch: FieldPatch,
): FieldDefinition[] {
  if (!defs.some((d) => d.key === key)) return defs;
  const next = defs.map((d) => {
    if (d.key !== key) return d;
    const merged: FieldDefinition = { ...d, ...patch };
    if (!merged.required) delete merged.required;
    if (merged.min === undefined) delete merged.min;
    if (merged.max === undefined) delete merged.max;
    return merged;
  });
  return fieldsSchema.parse(next);
}

export function removeField(defs: FieldDefinition[], key: string): FieldDefinition[] {
  return defs.filter((d) => d.key !== key);
}

export function moveField(
  defs: FieldDefinition[],
  key: string,
  direction: 'up' | 'down',
): FieldDefinition[] {
  const from = defs.findIndex((d) => d.key === key);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= defs.length) return defs;
  const next = [...defs];
  [next[from], next[to]] = [next[to] as FieldDefinition, next[from] as FieldDefinition];
  return next;
}
