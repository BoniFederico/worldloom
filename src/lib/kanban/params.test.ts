import { describe, expect, it } from 'vitest';
import { DEFAULT_KANBAN, kanbanQuery, parseKanbanConfig, parseKanbanParams } from './params';

describe('parseKanbanParams', () => {
  it('senza parametri dà i predefiniti; accetta lo stato o la chiave di un campo', () => {
    expect(parseKanbanParams({})).toEqual(DEFAULT_KANBAN);
    expect(parseKanbanParams({ by: 'status' }).by).toBe('status');
    expect(
      parseKanbanParams({ by: 'trama_stato', category: '5b6e1c1e-8a8e-4c53-9d0e-0f4f4fbb4b8e' }),
    ).toEqual({
      by: 'trama_stato',
      category: '5b6e1c1e-8a8e-4c53-9d0e-0f4f4fbb4b8e',
    });
  });

  it('scarta chiavi e categorie non valide, e prende il primo valore ripetuto', () => {
    expect(parseKanbanParams({ by: 'Non Valida!' }).by).toBeNull();
    expect(parseKanbanParams({ by: 'a'.repeat(50) }).by).toBeNull();
    expect(parseKanbanParams({ by: ['status', 'x'] }).by).toBe('status');
    expect(parseKanbanParams({ by: 'status', category: 'no' }).category).toBeNull();
  });
});

describe('kanbanQuery', () => {
  it('scrive solo il non predefinito e si rilegge uguale', () => {
    expect(kanbanQuery(DEFAULT_KANBAN)).toBe('');
    const p = parseKanbanParams({ by: 'status', category: '5b6e1c1e-8a8e-4c53-9d0e-0f4f4fbb4b8e' });
    expect(parseKanbanParams(Object.fromEntries(new URLSearchParams(kanbanQuery(p))))).toEqual(p);
  });
});

describe('parseKanbanConfig', () => {
  it('accetta la configurazione salvata con gli stessi limiti', () => {
    expect(parseKanbanConfig({ by: 'status', category: null })).toEqual({
      by: 'status',
      category: null,
    });
    expect(parseKanbanConfig(null)).toEqual(DEFAULT_KANBAN);
    expect(parseKanbanConfig({ by: 5, category: {} })).toEqual(DEFAULT_KANBAN);
  });
});
