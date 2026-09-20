import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@/lib/fields/fields';
import { EDITABLE_TYPES, mergeFieldInput } from './form';

const defs: FieldDefinition[] = [
  { key: 'nome', label: 'Nome', type: 'text' },
  { key: 'eta', label: 'Età', type: 'number' },
  { key: 'nascita', label: 'Nascita', type: 'date' },
  { key: 'stato', label: 'Stato', type: 'choice', options: ['vivo', 'morto'] },
  { key: 'luogo', label: 'Luogo', type: 'snippet_ref' },
  { key: 'pos', label: 'Posizione', type: 'coordinates' },
];

const form = (values: Record<string, string>) => (name: string) => values[name];

describe('mergeFieldInput', () => {
  it('converte i valori del form per tipo', () => {
    const input = mergeFieldInput(
      defs,
      {},
      form({ 'f:nome': 'Elara', 'f:eta': '42', 'f:nascita': '2024-02-29', 'f:stato': 'vivo' }),
    );
    expect(input).toMatchObject({ nome: 'Elara', eta: 42, nascita: '2024-02-29', stato: 'vivo' });
  });

  it('un valore vuoto sovrascrive quello esistente (il campo si svuota)', () => {
    const input = mergeFieldInput(defs, { nome: 'Vecchio' }, form({ 'f:nome': '' }));
    expect(input.nome).toBe('');
  });

  it('un numero non valido resta non valido invece di sparire', () => {
    const input = mergeFieldInput(defs, {}, form({ 'f:eta': 'abc' }));
    expect(Number.isNaN(input.eta)).toBe(true);
  });

  it('conserva i valori dei tipi non modificabili da questo form e le chiavi orfane', () => {
    const existing = { pos: { x: 0.5, y: 0.5 }, vecchio: 'x' };
    const input = mergeFieldInput(defs, existing, form({ 'f:nome': 'A' }));
    expect(input.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(input.vecchio).toBe('x');
  });

  it('un campo assente dal form non tocca il valore esistente', () => {
    const input = mergeFieldInput(defs, { nome: 'Resta' }, form({}));
    expect(input.nome).toBe('Resta');
  });

  it('elenca i tipi modificabili', () => {
    expect(EDITABLE_TYPES).toEqual(['text', 'number', 'date', 'choice', 'snippet_ref']);
  });
});
