export type Card = {
  id: string;
  title: string;
  value: string | null;
  /** `updated_at` letto: lo spostamento non sovrascrive una modifica più recente. */
  updated?: string;
};

export type Column = {
  /** `null`: le card senza valore. */
  value: string | null;
  /** Valore non più tra le opzioni del campo (opzione rimossa dopo l'inserimento). */
  other: boolean;
  cards: Card[];
};

export type Board = { columns: Column[]; count: number };

const byTitle = (a: Card, b: Card) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });

/**
 * Colonne della bacheca: «senza valore» in testa, poi le opzioni nell'ordine del campo, poi i valori rimasti orfani.
 * Le card di ogni colonna sono ordinate per titolo.
 */
export function buildBoard(cards: Card[], options: string[]): Board {
  const known = new Set(options);
  const groups = new Map<string | null, Card[]>([
    [null, []],
    ...options.map((o) => [o, []] as [string, Card[]]),
  ]);
  for (const c of cards) {
    const key = c.value === null || c.value === '' ? null : c.value;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const columns = [...groups].map(([value, list]): Column => ({
    value,
    other: value !== null && !known.has(value),
    cards: list.sort(byTitle),
  }));
  return { columns, count: cards.length };
}
