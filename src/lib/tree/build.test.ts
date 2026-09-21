import { describe, expect, it } from 'vitest';
import { buildForest, flip, type Edge, type TreeNode } from './build';

const titles = new Map(
  ['Aldo', 'Bea', 'Carlo', 'Dina', 'Enzo', 'Fiora', 'Gino'].map((t) => [t.toLowerCase(), t]),
);
const e = (parent: string, child: string): Edge => ({ parent, child });

/** Forma compatta per i confronti: «Aldo(Bea(Dina),Carlo)». */
const show = (n: TreeNode): string => {
  const mark = n.kind === 'cycle' ? '!' : n.kind === 'repeat' ? '=' : '';
  return `${n.title}${mark}${n.children.length ? `(${n.children.map(show).join(',')})` : ''}`;
};
const forest = (r: ReturnType<typeof buildForest>) => r.roots.map(show).join(' | ');

describe('buildForest', () => {
  it('costruisce l’albero dalle radici (chi non ha genitori), figli in ordine alfabetico', () => {
    const r = buildForest(titles, [e('aldo', 'carlo'), e('aldo', 'bea'), e('bea', 'dina')]);
    expect(forest(r)).toBe('Aldo(Bea(Dina),Carlo)');
    expect(r.count).toBe(4);
    expect(r.hasCycle).toBe(false);
    expect(r.truncated).toBe(false);
  });

  it('più radici, ordinate per titolo; gli snippet senza relazioni non compaiono', () => {
    const r = buildForest(titles, [e('enzo', 'fiora'), e('aldo', 'bea')]);
    expect(forest(r)).toBe('Aldo(Bea) | Enzo(Fiora)');
  });

  it('un figlio con due genitori è espanso una volta sola, l’altra volta è un rimando', () => {
    const r = buildForest(titles, [e('aldo', 'carlo'), e('bea', 'carlo'), e('carlo', 'dina')]);
    expect(forest(r)).toBe('Aldo(Carlo(Dina)) | Bea(Carlo=)');
    expect(r.count).toBe(4);
  });

  it('un ciclo non manda in loop: il nodo che chiude il giro è segnato', () => {
    const r = buildForest(titles, [e('aldo', 'bea'), e('bea', 'carlo'), e('carlo', 'aldo')]);
    // Nessuna radice vera: si parte dal primo per titolo e il ritorno su Aldo è un ciclo.
    expect(forest(r)).toBe('Aldo(Bea(Carlo(Aldo!)))');
    expect(r.hasCycle).toBe(true);
  });

  it('un ciclo sotto una radice normale e un auto-collegamento', () => {
    const r = buildForest(titles, [
      e('aldo', 'bea'),
      e('bea', 'carlo'),
      e('carlo', 'bea'),
      e('dina', 'dina'),
    ]);
    expect(forest(r)).toBe('Aldo(Bea(Carlo(Bea!))) | Dina(Dina!)');
    expect(r.hasCycle).toBe(true);
  });

  it('con una radice scelta mostra solo il suo sottoalbero; una radice sconosciuta dà un albero vuoto', () => {
    const edges = [e('aldo', 'bea'), e('bea', 'dina'), e('enzo', 'fiora')];
    expect(forest(buildForest(titles, edges, { root: 'bea' }))).toBe('Bea(Dina)');
    expect(buildForest(titles, edges, { root: 'nessuno' }).roots).toEqual([]);
    // Una radice senza discendenti è un albero di un solo nodo.
    expect(forest(buildForest(titles, edges, { root: 'gino' }))).toBe('Gino');
  });

  it('ignora archi verso snippet sconosciuti e archi doppi', () => {
    const r = buildForest(titles, [e('aldo', 'bea'), e('aldo', 'bea'), e('aldo', 'sconosciuto')]);
    expect(forest(r)).toBe('Aldo(Bea)');
    expect(r.edgeCount).toBe(1);
  });

  it('si ferma al tetto di nodi e lo segnala', () => {
    const r = buildForest(
      titles,
      [e('aldo', 'bea'), e('aldo', 'carlo'), e('aldo', 'dina'), e('aldo', 'enzo')],
      { maxNodes: 3 },
    );
    expect(r.truncated).toBe(true);
    expect(r.count).toBe(3);
  });

  it('una catena molto lunga non manda in overflow lo stack', () => {
    const big = new Map<string, string>();
    const edges: Edge[] = [];
    for (let i = 0; i < 400; i++) big.set(`n${i}`, `N${String(i).padStart(3, '0')}`);
    for (let i = 0; i < 399; i++) edges.push(e(`n${i}`, `n${i + 1}`));
    const r = buildForest(big, edges, { maxNodes: 1000 });
    expect(r.count).toBe(400);
  });
});

describe('flip', () => {
  it('inverte il verso degli archi (per risalire agli antenati)', () => {
    expect(flip([e('a', 'b')])).toEqual([e('b', 'a')]);
    const r = buildForest(titles, flip([e('aldo', 'bea'), e('bea', 'dina')]), { root: 'dina' });
    expect(forest(r)).toBe('Dina(Bea(Aldo))');
  });
});
