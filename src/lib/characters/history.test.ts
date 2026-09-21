import { describe, expect, it } from 'vitest';
import { describeChanges } from './history';

describe('describeChanges', () => {
  const labels = { str: 'Forza', hp: 'Punti ferita', skills: 'Abilità' };

  it('traduce nome, numeri, liste e note', () => {
    expect(
      describeChanges(
        {
          name: ['Alfa', 'Alfa II'],
          'attributes.str': [10, 12],
          'resources.hp': [null, 7],
          'lists.skills': true,
          notes: true,
        },
        labels,
      ),
    ).toEqual([
      { type: 'number', label: 'Forza', from: '10', to: '12' },
      { type: 'edited', label: 'Abilità' },
      { type: 'name', from: 'Alfa', to: 'Alfa II' },
      { type: 'notes' },
      { type: 'number', label: 'Punti ferita', from: null, to: '7' },
    ]);
  });

  it('usa la chiave se lo schema non la conosce più e ignora il resto', () => {
    expect(describeChanges({ 'text.bio': true, strano: 1, 'foo.bar': 2 }, {})).toEqual([
      { type: 'edited', label: 'bio' },
    ]);
  });

  it('un valore che non è un oggetto non dà voci; un numero non finito diventa vuoto', () => {
    expect(describeChanges(null, labels)).toEqual([]);
    expect(describeChanges([1], labels)).toEqual([]);
    expect(describeChanges({ 'attributes.str': ['x', 3] }, labels)).toEqual([
      { type: 'number', label: 'Forza', from: null, to: '3' },
    ]);
  });
});
