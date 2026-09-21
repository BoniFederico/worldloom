import { describe, expect, it } from 'vitest';
import { buildBoard, type Card } from './build';

const card = (id: string, title: string, value: string | null): Card => ({ id, title, value });

describe('buildBoard', () => {
  const options = ['Idea', 'In corso', 'Fatto'];

  it("crea una colonna per opzione nell'ordine dato, più «senza valore» in testa", () => {
    const board = buildBoard(
      [card('1', 'Beta', 'In corso'), card('2', 'Alfa', 'Idea'), card('3', 'Gamma', null)],
      options,
    );
    expect(board.columns.map((c) => c.value)).toEqual([null, 'Idea', 'In corso', 'Fatto']);
    expect(board.columns.map((c) => c.cards.map((x) => x.title))).toEqual([
      ['Gamma'],
      ['Alfa'],
      ['Beta'],
      [],
    ]);
  });

  it('ordina le card per titolo', () => {
    const board = buildBoard([card('1', 'b', 'Idea'), card('2', 'A', 'Idea')], options);
    expect(board.columns[1]?.cards.map((c) => c.title)).toEqual(['A', 'b']);
  });

  it('un valore fuori dalle opzioni finisce in una colonna «altro» in coda', () => {
    const board = buildBoard([card('1', 'X', 'Vecchio')], options);
    const last = board.columns.at(-1);
    expect(last?.other).toBe(true);
    expect(last?.value).toBe('Vecchio');
    expect(last?.cards).toHaveLength(1);
  });

  it('conta le card', () => {
    expect(buildBoard([card('1', 'X', 'Idea')], options).count).toBe(1);
    expect(buildBoard([], options).count).toBe(0);
  });
});
