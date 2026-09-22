import { describe, expect, it } from 'vitest';
import { DICE_LIMITS, rollNotation } from './roll';

/** rng che restituisce esattamente la sequenza di [0,1) indicata, in ordine, per ogni chiamata. */
function queue(...values: number[]) {
  let i = 0;
  return () => values[i++]!;
}

describe('rollNotation', () => {
  it('somma più dadi e un modificatore', () => {
    // 2d6: primo dado 4/6 (=> 0.5 esatto => floor(3)=3 => faccia 4), secondo 1/6 (=> floor(0)=0 => faccia 1)
    const rng = queue(3 / 6, 0 / 6);
    const result = rollNotation('2d6+3', {}, 'normal', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.groups).toEqual([{ sides: 6, count: 2, rolls: [4, 1] }]);
    expect(result.total).toBe(4 + 1 + 3);
  });

  it('legge una variabile dallo scope (formula con statistiche)', () => {
    const rng = queue(19 / 20);
    const result = rollNotation('1d20+str_mod', { str_mod: 3 }, 'normal', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.groups).toEqual([{ sides: 20, count: 1, rolls: [20] }]);
    expect(result.total).toBe(23);
  });

  it('rispetta la precedenza degli operatori con un termine di dado', () => {
    const rng = queue(3 / 6); // faccia 4
    const result = rollNotation('2*1d6', {}, 'normal', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(8);
  });

  it('accetta un modificatore negativo', () => {
    const rng = queue(3 / 4); // faccia 4
    const result = rollNotation('1d4-2', {}, 'normal', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(2);
  });

  it('vantaggio: tira due volte e tiene il totale più alto', () => {
    const rng = queue(2 / 20, 17 / 20); // facce 3 e 18
    const result = rollNotation('1d20', {}, 'advantage', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(18);
    expect(result.other?.total).toBe(3);
  });

  it('svantaggio: tira due volte e tiene il totale più basso', () => {
    const rng = queue(2 / 20, 17 / 20); // facce 3 e 18
    const result = rollNotation('1d20', {}, 'disadvantage', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(3);
    expect(result.other?.total).toBe(18);
  });

  it('rifiuta una notazione vuota', () => {
    const result = rollNotation('', {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('empty');
  });

  it('rifiuta una notazione senza alcun dado', () => {
    const result = rollNotation('3+2', {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('no_dice');
  });

  it('rifiuta un dado con zero facce', () => {
    const result = rollNotation('1d0', {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_sides');
  });

  it('rifiuta troppi dadi in un termine', () => {
    const result = rollNotation(`${DICE_LIMITS.maxDicePerTerm + 1}d6`, {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too_many_dice');
  });

  it('rifiuta troppi dadi totali su più termini', () => {
    const half = Math.ceil(DICE_LIMITS.maxTotalDice / 2) + 1;
    const result = rollNotation(`${half}d6+${half}d6`, {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too_many_dice');
  });

  it('rifiuta una variabile sconosciuta con un errore di formula', () => {
    const result = rollNotation('1d20+str_mod', {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('formula_error');
  });

  it('rifiuta una notazione troppo lunga', () => {
    const result = rollNotation('1d6+'.repeat(100), {}, 'normal', () => 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('too_long');
  });
});
