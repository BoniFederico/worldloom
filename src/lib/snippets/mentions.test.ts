import { describe, expect, it } from 'vitest';
import { fold, suggestMentions } from './mentions';

const candidates = [
  { id: '1', title: 'Elara', aliases: ['La Dama Grigia'] },
  { id: '2', title: 'Aurelia', aliases: [] },
  { id: '3', title: 'Balrog', aliases: ['Flagello di Durin', 'Ombra antica'] },
  { id: '4', title: 'Élan Vital', aliases: [] },
];

describe('suggestMentions', () => {
  it('prima chi inizia con il testo, poi chi lo contiene, senza badare a maiuscole e accenti', () => {
    const r = suggestMentions(candidates, 'ela');
    expect(r.map((s) => s.title)).toEqual(
      ['Elara', 'Élan Vital'].sort((a, b) => a.localeCompare(b)),
    );
    expect(suggestMentions(candidates, 'RELIA').map((s) => s.title)).toEqual(['Aurelia']);
  });

  it('riconosce gli alias e li indica', () => {
    expect(suggestMentions(candidates, 'dama')).toEqual([
      { id: '1', title: 'Elara', alias: 'La Dama Grigia' },
    ]);
    expect(suggestMentions(candidates, 'flagello')).toEqual([
      { id: '3', title: 'Balrog', alias: 'Flagello di Durin' },
    ]);
  });

  it('senza testo offre i primi, rispettando il limite', () => {
    expect(suggestMentions(candidates, '', 2)).toHaveLength(2);
    expect(suggestMentions(candidates, '  ', 10)).toHaveLength(4);
  });

  it('nessuna corrispondenza: elenco vuoto', () => {
    expect(suggestMentions(candidates, 'zzz')).toEqual([]);
  });
});

describe('fold', () => {
  it('toglie gli accenti', () => {
    expect(fold('Élan Ünï')).toBe('elan uni');
  });
});
