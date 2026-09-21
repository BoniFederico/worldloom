import { describe, expect, it } from 'vitest';
import { evalFormula, parseFormula } from './formula';

const value = (src: string, scope: Record<string, number> = {}) => {
  const r = evalFormula(src, scope);
  if (!r.ok) throw new Error(`${r.error.code} @${r.error.index}`);
  return r.value;
};
const code = (src: string, scope: Record<string, number> = {}) => {
  const p = parseFormula(src);
  if (!p.ok) return p.error.code;
  const r = evalFormula(src, scope);
  return r.ok ? 'ok' : r.error.code;
};

describe('formule: aritmetica', () => {
  it('rispetta precedenza, parentesi e unario', () => {
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('-2 * -3')).toBe(6);
    expect(value('10 - 4 - 3')).toBe(3);
    expect(value('7 % 4')).toBe(3);
    expect(value('7 / 2')).toBe(3.5);
    expect(value('1.5 + .5')).toBe(2);
  });

  it('legge le variabili dallo scope', () => {
    expect(value('floor((str - 10) / 2)', { str: 17 })).toBe(3);
    expect(value('floor((str - 10) / 2)', { str: 8 })).toBe(-1);
    expect(value('10 + str_mod * level', { str_mod: 3, level: 2 })).toBe(16);
  });

  it('confronti e logica danno 1 o 0', () => {
    expect(value('3 > 2')).toBe(1);
    expect(value('3 <= 2')).toBe(0);
    expect(value('2 == 2 && 1 != 1')).toBe(0);
    expect(value('0 || 5 > 1')).toBe(1);
    expect(value('!0')).toBe(1);
  });

  it('funzioni: arrotondamenti, min/max, clamp, if, pow, sqrt', () => {
    expect(value('floor(2.9) + ceil(2.1) + round(2.5) + trunc(-2.9)')).toBe(2 + 3 + 3 - 2);
    expect(value('abs(-4) + sign(-9)')).toBe(3);
    expect(value('min(4, 2, 9) + max(4, 2, 9)')).toBe(11);
    expect(value('clamp(15, 1, 10)')).toBe(10);
    expect(value('if(str > 9, 1, 0)', { str: 10 })).toBe(1);
    expect(value('pow(2, 10)')).toBe(1024);
    expect(value('sqrt(81)')).toBe(9);
  });

  it('if valuta solo il ramo scelto', () => {
    expect(value('if(1, 5, 1 / 0)')).toBe(5);
    expect(code('if(0, 5, 1 / 0)')).toBe('division_by_zero');
  });
});

describe('formule: errori con posizione', () => {
  it('sintassi', () => {
    expect(code('')).toBe('empty');
    expect(code('1 +')).toBe('unexpected_end');
    expect(code('(1 + 2')).toBe('unexpected_end');
    expect(code('1 2')).toBe('unexpected_token');
    expect(code('1 $ 2')).toBe('unexpected_char');
    expect(code('1..2')).toBe('invalid_number');
  });

  it('funzioni sconosciute o con argomenti sbagliati', () => {
    expect(code('eval(1)')).toBe('unknown_function');
    expect(code('constructor(1)')).toBe('unknown_function');
    expect(code('floor(1, 2)')).toBe('wrong_arity');
    expect(code('max()')).toBe('wrong_arity');
    expect(code('clamp(1)')).toBe('wrong_arity');
  });

  it('variabili, divisioni e domini', () => {
    expect(code('foo + 1')).toBe('unknown_variable');
    expect(code('1 / 0')).toBe('division_by_zero');
    expect(code('5 % 0')).toBe('division_by_zero');
    expect(code('sqrt(-1)')).toBe('domain');
    expect(code('pow(10, 1000)')).toBe('not_finite');
    expect(code('pow(2, 2000)')).toBe('domain');
  });

  it('nessun accesso al prototipo o al codice', () => {
    expect(code('__proto__')).toBe('unknown_variable');
    expect(code('constructor')).toBe('unknown_variable');
    expect(code('toString + 1')).toBe('unknown_variable');
    expect(code('this.constructor')).toBe('unexpected_char');
    expect(code('process.exit(1)')).toBe('unexpected_char');
  });

  it('indica la posizione dell’errore', () => {
    const r = parseFormula('1 + * 2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.index).toBe(4);
  });

  it('elenca le variabili usate', () => {
    const r = parseFormula('floor((str - 10) / 2) + str + level');
    expect(r.ok && r.refs).toEqual(['str', 'level']);
  });
});

describe('formule: limiti', () => {
  it('rifiuta formule troppo lunghe', () => {
    expect(code('1+'.repeat(300) + '1')).toBe('too_long');
  });

  it('rifiuta annidamenti troppo profondi', () => {
    expect(code('('.repeat(60) + '1' + ')'.repeat(60))).toBe('too_complex');
    expect(code('-'.repeat(60) + '1')).toBe('too_complex');
    expect(code('floor('.repeat(40) + '1' + ')'.repeat(40))).toBe('too_complex');
  });

  it('rifiuta formule con troppi nodi', () => {
    expect(code(Array.from({ length: 150 }, () => 'a').join('+'))).toBe('too_complex');
  });

  it('interrompe la valutazione oltre il budget di passi', () => {
    const r = evalFormula('1 + 2 + 3 + 4 + 5', {}, { maxSteps: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('budget_exceeded');
  });
});

describe('formule: valori non finiti', () => {
  const huge = '9'.repeat(400);
  it('un letterale enorme è un errore, non Infinity', () => {
    expect(code(huge)).toBe('invalid_number');
    expect(code(`if(1, ${huge}, 0)`)).toBe('invalid_number');
    expect(code(`-${huge}`)).toBe('invalid_number');
  });
});

describe('formule: robustezza', () => {
  it('testi qualsiasi non lanciano mai: o si valutano o danno un errore', () => {
    const pieces = [
      '1',
      '2.5',
      'a',
      'floor',
      '(',
      ')',
      ',',
      '+',
      '-',
      '*',
      '/',
      '%',
      '<',
      '&&',
      '!',
      'if',
      '.',
      '$',
      ' ',
      '\n',
    ];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let n = 0; n < 2000; n++) {
      const src = Array.from(
        { length: 1 + Math.floor(rnd() * 20) },
        () => pieces[Math.floor(rnd() * pieces.length)],
      ).join('');
      const r = evalFormula(src, { a: 3 });
      expect(typeof r.ok).toBe('boolean');
    }
  });
});
