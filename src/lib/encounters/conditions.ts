export const MAX_CONDITIONS = 20;
export const MAX_CONDITION_LENGTH = 40;

export type ConditionsResult = { ok: true; values: string[] } | { ok: false };

/**
 * Condizioni di un partecipante allo scontro, testo libero separato da virgola o a capo (come i tag, ma senza
 * forzare le minuscole: «Stordito» resta leggibile in tabella). Doppioni uniti senza badare alle maiuscole.
 */
export function parseConditions(input: string): ConditionsResult {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of input.split(/[,\n\r]+/)) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (clean.length > MAX_CONDITION_LENGTH) return { ok: false };
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(clean);
  }
  return values.length > MAX_CONDITIONS ? { ok: false } : { ok: true, values };
}
