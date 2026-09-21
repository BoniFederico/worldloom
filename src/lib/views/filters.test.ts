import { describe, expect, it } from 'vitest';
import { parseSearchParams } from '@/lib/search/params';
import { filtersOf, paramsOfFilters, searchQuery, viewNameSchema, VIEW_KINDS } from './filters';

const CAT = '11111111-1111-4111-8111-111111111111';

describe('filtersOf / paramsOfFilters', () => {
  it('salva solo i criteri impostati', () => {
    expect(filtersOf(parseSearchParams({ q: 'elfo' }))).toEqual({ q: 'elfo' });
    expect(filtersOf(parseSearchParams({}))).toEqual({});
  });

  it('round trip: i filtri salvati ridanno gli stessi parametri di ricerca', () => {
    const p = parseSearchParams({
      q: ' elfo  arciere ',
      category: CAT,
      tags: 'eroe, nord',
      status: 'final',
      field: 'eta',
      value: '42',
      relation: 'alleato di',
      archived: '1',
    });
    const saved = filtersOf(p);
    expect(paramsOfFilters(JSON.parse(JSON.stringify(saved)))).toEqual(p);
  });

  it.each([
    ['null', null],
    ['stringa', 'ciao'],
    ['array', [1, 2]],
    ['valori di tipo sbagliato', { q: 42, tags: { a: 1 }, status: 'boh', category: 'non-uuid' }],
    ['chiavi sconosciute', { __proto__: { x: 1 }, sql: "'; drop table snippets; --" }],
  ])('ripara filtri malformati senza errori: %s', (_name, input) => {
    const p = paramsOfFilters(input);
    expect(p.category).toBeNull();
    expect(p.status).toBeNull();
    expect(typeof p.q).toBe('string');
  });

  it('un tag salvato con caratteri non validi viene scartato', () => {
    expect(paramsOfFilters({ tags: ['ok', 'a,b', '{x}'] }).tags).toEqual(['ok']);
  });
});

describe('searchQuery', () => {
  it('costruisce la query string della ricerca con i soli criteri impostati', () => {
    const qs = searchQuery(parseSearchParams({ q: 'elfo', tags: 'eroe', archived: '1' }));
    expect(new URLSearchParams(qs).get('q')).toBe('elfo');
    expect(new URLSearchParams(qs).get('tags')).toBe('eroe');
    expect(new URLSearchParams(qs).get('archived')).toBe('1');
    expect(new URLSearchParams(qs).has('status')).toBe(false);
  });

  it('codifica i caratteri speciali', () => {
    const qs = searchQuery(parseSearchParams({ q: 'a&b=c#d' }));
    expect(new URLSearchParams(qs).get('q')).toBe('a&b=c#d');
  });
});

describe('viewNameSchema e tipi', () => {
  it('accetta nomi da 1 a 80 caratteri, con spazi rifilati', () => {
    expect(viewNameSchema.parse('  Elfi del nord ')).toBe('Elfi del nord');
    expect(viewNameSchema.safeParse('   ').success).toBe(false);
    expect(viewNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });

  it('i tipi coincidono con quelli ammessi dal database', () => {
    expect([...VIEW_KINDS]).toEqual([
      'list',
      'table',
      'graph',
      'timeline',
      'map',
      'tree',
      'kanban',
    ]);
  });
});
