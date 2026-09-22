import { describe, expect, it } from 'vitest';
import { isValidInitiative, parseHp } from './input';

describe('isValidInitiative', () => {
  it('accetta numeri finiti, anche negativi o decimali', () => {
    expect(isValidInitiative(18)).toBe(true);
    expect(isValidInitiative(-2)).toBe(true);
    expect(isValidInitiative(14.5)).toBe(true);
  });
  it('rifiuta NaN, infinito e valori estremi', () => {
    expect(isValidInitiative(NaN)).toBe(false);
    expect(isValidInitiative(Infinity)).toBe(false);
    expect(isValidInitiative(2_000_000)).toBe(false);
  });
});

describe('parseHp', () => {
  it('un campo vuoto vale «nessun valore»', () => {
    expect(parseHp('')).toEqual({ ok: true, value: null });
    expect(parseHp('   ')).toEqual({ ok: true, value: null });
  });
  it('accetta un intero non negativo', () => {
    expect(parseHp('12')).toEqual({ ok: true, value: 12 });
    expect(parseHp('0')).toEqual({ ok: true, value: 0 });
  });
  it('rifiuta un numero negativo, non intero o non numerico', () => {
    expect(parseHp('-1').ok).toBe(false);
    expect(parseHp('1.5').ok).toBe(false);
    expect(parseHp('abc').ok).toBe(false);
  });
});
