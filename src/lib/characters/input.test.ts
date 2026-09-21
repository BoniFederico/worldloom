import { describe, expect, it } from 'vitest';
import { characterInput } from './input';

const U = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const raw = (over: Partial<Record<'name' | 'kind' | 'owner' | 'notes', string>> = {}) => ({
  name: ' Alfa ',
  kind: 'pc',
  owner: P,
  notes: '',
  ...over,
});

describe('characterInput', () => {
  it('chi gestisce sceglie tipo e proprietario; il PNG non ha proprietario', () => {
    expect(characterInput(raw(), true, U)).toEqual({
      name: 'Alfa',
      kind: 'pc',
      owner: P,
      notes: '',
    });
    expect(characterInput(raw({ kind: 'npc' }), true, U)).toMatchObject({
      kind: 'npc',
      owner: null,
    });
    expect(characterInput(raw({ owner: '' }), true, U)).toMatchObject({ owner: null });
  });

  it('un giocatore crea sempre un PG per sé, qualunque cosa mandi', () => {
    expect(characterInput(raw({ kind: 'npc', owner: P }), false, U)).toMatchObject({
      kind: 'pc',
      owner: U,
    });
  });

  it('rifiuta nome vuoto o troppo lungo, tipo sconosciuto, proprietario non valido, note enormi', () => {
    expect(characterInput(raw({ name: '  ' }), true, U)).toBeNull();
    expect(characterInput(raw({ name: 'x'.repeat(121) }), true, U)).toBeNull();
    expect(characterInput(raw({ kind: 'dragon' }), true, U)).toBeNull();
    expect(characterInput(raw({ owner: 'no' }), true, U)).toBeNull();
    expect(characterInput(raw({ notes: 'x'.repeat(20001) }), true, U)).toBeNull();
  });
});
