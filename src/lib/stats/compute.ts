import { evalFormula, type FormulaError } from './formula';
import type { Attribute, StatsSchema } from './schema';

export type ValidSchema = { schema: StatsSchema; derivedOrder: string[] };

export type SheetError = { key: string; error: FormulaError };

export type Sheet = {
  /** Valori degli attributi usati (quelli dati, o il predefinito). */
  attributes: Record<string, number>;
  /** Derivati calcolati; `null` se la formula non si può valutare (l'errore è in `errors`). */
  derived: Record<string, number | null>;
  /** Massimo di ogni risorsa `pool`, per chiave della risorsa. */
  max: Record<string, number | null>;
  errors: SheetError[];
};

export type ValueError = { key: string; code: 'not_a_number' | 'not_integer' | 'out_of_range' };

/** Valore di partenza di un attributo: il predefinito, altrimenti il minimo, altrimenti 0. */
export const defaultOf = (a: Attribute): number => a.default ?? a.min ?? 0;

/** Controlla i valori dati per gli attributi (numero finito, intero se richiesto, entro min e max). */
export function checkAttributeValues(
  schema: StatsSchema,
  values: Readonly<Record<string, unknown>>,
): ValueError[] {
  const errors: ValueError[] = [];
  for (const a of schema.attributes) {
    if (!Object.hasOwn(values, a.key)) continue;
    const v = values[a.key];
    if (typeof v !== 'number' || !Number.isFinite(v))
      errors.push({ key: a.key, code: 'not_a_number' });
    else if (a.type === 'integer' && !Number.isInteger(v))
      errors.push({ key: a.key, code: 'not_integer' });
    else if ((a.min !== undefined && v < a.min) || (a.max !== undefined && v > a.max)) {
      errors.push({ key: a.key, code: 'out_of_range' });
    }
  }
  return errors;
}

/**
 * Calcola i derivati (nell'ordine delle dipendenze) e i massimi delle risorse di una scheda. I valori mancanti o non numerici
 * degli attributi usano il predefinito. Un errore di formula non ferma il resto: quella voce vale `null` e l'errore si riporta.
 */
export function computeSheet(
  valid: ValidSchema,
  values: Readonly<Record<string, unknown>> = {},
): Sheet {
  const { schema, derivedOrder } = valid;
  const scope = new Map<string, number>();
  const attributes: Record<string, number> = {};
  for (const a of schema.attributes) {
    const given = Object.hasOwn(values, a.key) ? values[a.key] : undefined;
    const v = typeof given === 'number' && Number.isFinite(given) ? given : defaultOf(a);
    attributes[a.key] = v;
    scope.set(a.key, v);
  }

  const errors: SheetError[] = [];
  const derived: Record<string, number | null> = {};
  const failed = new Set<string>();
  const byKey = new Map(schema.derived.map((d) => [d.key, d]));
  for (const k of derivedOrder) {
    const d = byKey.get(k)!;
    const r = evalFormula(d.formula, scope);
    if (!r.ok && r.error.code === 'unknown_variable' && failed.has(r.error.name ?? '')) {
      derived[k] = null;
      failed.add(k);
      errors.push({ key: k, error: { ...r.error, code: 'dependency_failed' } });
    } else if (r.ok) {
      derived[k] = r.value;
      scope.set(k, r.value);
    } else {
      derived[k] = null;
      failed.add(k);
      errors.push({ key: k, error: r.error });
    }
  }

  const max: Record<string, number | null> = {};
  for (const res of schema.resources) {
    if (res.max !== undefined) {
      max[res.key] = res.max;
      continue;
    }
    const r = evalFormula(res.maxFormula ?? '', scope);
    if (r.ok) max[res.key] = Math.max(0, r.value);
    else {
      max[res.key] = null;
      const dep = r.error.code === 'unknown_variable' && failed.has(r.error.name ?? '');
      errors.push({
        key: res.key,
        error: dep ? { ...r.error, code: 'dependency_failed' } : r.error,
      });
    }
  }
  return { attributes, derived, max, errors };
}
