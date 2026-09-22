/**
 * Tiratore di dadi (#39). Notazione standard (`2d6+3`, `1d20+str_mod`): i termini `NdM` si estraggono, si tirano con
 * l'rng passato e si sostituiscono con la loro somma; il resto dell'espressione (modificatori, variabili, funzioni)
 * passa dall'interprete di formule già usato per le statistiche (#33, `src/lib/stats/formula.ts`) — stesso sandbox,
 * nessuna sintassi nuova da validare. Vantaggio/svantaggio sono generici (non solo per i20): si tira l'intera
 * espressione due volte e si tiene il totale più alto o più basso, come richiesto da SPEC ("il prodotto deve essere
 * generico per costruzione").
 */

import { evalFormula, type Scope } from '@/lib/stats/formula';

export type DiceMode = 'normal' | 'advantage' | 'disadvantage';

export type DieGroup = { sides: number; count: number; rolls: number[] };

export type RollErrorCode =
  'empty' | 'too_long' | 'no_dice' | 'invalid_sides' | 'too_many_dice' | 'formula_error';

export type RollError = { code: RollErrorCode; index: number; name?: string };

export type Attempt = { total: number; groups: DieGroup[] };

export type RollResult =
  ({ ok: true; other?: Attempt } & Attempt) | { ok: false; error: RollError };

export const DICE_LIMITS = {
  maxLength: 200,
  maxDicePerTerm: 100,
  maxSides: 1000,
  maxTotalDice: 100,
} as const;

const DIE_TERM = /(\d*)d(\d+)/gi;

function rollOnce(
  notation: string,
  scope: Scope,
  rng: () => number,
): Attempt | { error: RollError } {
  const groups: DieGroup[] = [];
  let totalDice = 0;
  let sawDice = false;
  let failure: RollError | undefined;

  const resolved = notation.replace(
    DIE_TERM,
    (match, countStr: string, sidesStr: string, offset: number) => {
      if (failure) return match;
      sawDice = true;
      const count = countStr === '' ? 1 : Number(countStr);
      const sides = Number(sidesStr);
      if (!Number.isInteger(sides) || sides < 1 || sides > DICE_LIMITS.maxSides) {
        failure = { code: 'invalid_sides', index: offset };
        return match;
      }
      if (!Number.isInteger(count) || count < 1 || count > DICE_LIMITS.maxDicePerTerm) {
        failure = { code: 'too_many_dice', index: offset };
        return match;
      }
      totalDice += count;
      if (totalDice > DICE_LIMITS.maxTotalDice) {
        failure = { code: 'too_many_dice', index: offset };
        return match;
      }
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
      groups.push({ sides, count, rolls });
      const sum = rolls.reduce((a, b) => a + b, 0);
      return `(${sum})`;
    },
  );

  if (failure) return { error: failure };
  if (!sawDice) return { error: { code: 'no_dice', index: 0 } };

  const evaluated = evalFormula(resolved, scope);
  if (!evaluated.ok) {
    return {
      error: {
        code: 'formula_error',
        index: evaluated.error.index,
        name: evaluated.error.name,
      },
    };
  }
  return { total: evaluated.value, groups };
}

/** Tira una notazione di dadi (con eventuali variabili di scope) e restituisce il totale e i singoli risultati. */
export function rollNotation(
  notation: string,
  scope: Scope = {},
  mode: DiceMode = 'normal',
  rng: () => number = Math.random,
): RollResult {
  if (notation.trim() === '') return { ok: false, error: { code: 'empty', index: 0 } };
  if (notation.length > DICE_LIMITS.maxLength) {
    return { ok: false, error: { code: 'too_long', index: DICE_LIMITS.maxLength } };
  }

  const first = rollOnce(notation, scope, rng);
  if ('error' in first) return { ok: false, error: first.error };
  if (mode === 'normal') return { ok: true, ...first };

  const second = rollOnce(notation, scope, rng);
  if ('error' in second) return { ok: false, error: second.error };

  const pick =
    mode === 'advantage'
      ? Math.max(first.total, second.total)
      : Math.min(first.total, second.total);
  const [chosen, other] = first.total === pick ? [first, second] : [second, first];
  return { ok: true, ...chosen, other };
}
