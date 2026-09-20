import type { FieldDefinition, FieldType } from '@/lib/fields/fields';

/**
 * Tipi che il form dello snippet sa modificare. Data in calendario, coordinate e immagine hanno editor
 * dedicati nelle viste che li usano (calendari, mappa): qui i loro valori si conservano e basta.
 */
export const EDITABLE_TYPES: FieldType[] = ['text', 'number', 'date', 'choice', 'snippet_ref'];

export const fieldInputName = (key: string) => `f:${key}`;

/**
 * Unisce i valori esistenti con quelli inviati dal form. Un campo presente nel form ma vuoto sovrascrive
 * (si svuota); un campo assente dal form o di tipo non modificabile mantiene il valore. Le chiavi che
 * nessuna categoria definisce (orfane) restano intatte.
 */
export function mergeFieldInput(
  defs: FieldDefinition[],
  existing: Record<string, unknown>,
  get: (name: string) => string | undefined,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...existing };
  for (const def of defs) {
    if (!EDITABLE_TYPES.includes(def.type)) continue;
    const raw = get(fieldInputName(def.key));
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value === '') input[def.key] = '';
    else input[def.key] = def.type === 'number' ? Number(value) : value;
  }
  return input;
}
