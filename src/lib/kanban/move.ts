import { validateSnippetFields, type FieldDefinition } from '@/lib/fields/fields';
import { EDITABLE_TYPES } from '@/lib/snippets/form';

export type MoveInput = {
  /** `status` oppure la chiave di un campo a scelta. */
  by: string;
  /** Nuovo valore; stringa vuota = nessun valore (solo per i campi). */
  to: string;
  status: string;
  fields: Record<string, unknown>;
  /** Campi delle categorie dello snippet. */
  defs: FieldDefinition[];
};

export type MoveError = 'invalid_target' | 'unknown_field' | 'required' | 'invalid_fields';
export type MovePlan =
  | { ok: true; patch: { status: 'draft' | 'final' } | { fields: Record<string, unknown> } }
  | { ok: false; error: MoveError };

/** Come nel salvataggio completo: i campi obbligatori che il modulo non sa modificare non bloccano lo stato definitivo. */
const enforceable = (defs: FieldDefinition[]) =>
  defs.map((d) =>
    EDITABLE_TYPES.includes(d.type) && d.type !== 'calendar_date' ? d : { ...d, required: false },
  );

/** Primo problema che il salvataggio segnalerebbe: campo obbligatorio mancante o valore non valido (ad esempio un'opzione rimossa). */
const problem = (
  defs: FieldDefinition[],
  fields: Record<string, unknown>,
): 'required' | 'invalid_fields' | null => {
  const errors = Object.values(
    validateSnippetFields(enforceable(defs), fields, { enforceRequired: true }).errors,
  );
  return errors.includes('invalid') ? 'invalid_fields' : errors.length ? 'required' : null;
};

/**
 * Cosa scrivere per spostare una card in un'altra colonna, con le stesse regole del salvataggio dello snippet:
 * solo opzioni esistenti, e i campi obbligatori valgono per gli snippet definitivi.
 */
export function planMove(input: MoveInput): MovePlan {
  if (input.by === 'status') {
    if (input.to !== 'draft' && input.to !== 'final') return { ok: false, error: 'invalid_target' };
    if (input.to === 'final') {
      const error = problem(input.defs, input.fields);
      if (error) return { ok: false, error };
    }
    return { ok: true, patch: { status: input.to } };
  }

  const choices = input.defs.filter((d) => d.key === input.by && d.type === 'choice');
  const def = choices[0];
  if (!def) return { ok: false, error: 'unknown_field' };
  const fields = { ...input.fields };
  if (input.to === '') {
    delete fields[def.key];
    if (input.status === 'final') {
      const error = problem(input.defs, fields);
      if (error) return { ok: false, error };
    }
    return { ok: true, patch: { fields } };
  }
  if (!choices.some((d) => d.options?.includes(input.to)))
    return { ok: false, error: 'invalid_target' };
  fields[def.key] = input.to;
  return { ok: true, patch: { fields } };
}
