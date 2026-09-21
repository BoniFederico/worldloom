export type Edge = { parent: string; child: string };

/** `node` è espanso qui; `cycle` chiude un giro (è un discendente di sé stesso); `repeat` è già stato mostrato altrove. */
export type TreeNode = {
  id: string;
  title: string;
  kind: 'node' | 'cycle' | 'repeat';
  children: TreeNode[];
};

export type Forest = {
  roots: TreeNode[];
  /** Nodi espansi. */
  count: number;
  edgeCount: number;
  hasCycle: boolean;
  truncated: boolean;
};

export const TREE_MAX_NODES = 500;

const compare = (a: { title: string; id: string }, b: { title: string; id: string }) =>
  a.title.localeCompare(b.title, 'it') || a.id.localeCompare(b.id);

/** Archi con il verso opposto: per risalire dagli antenati invece di scendere ai discendenti. */
export const flip = (edges: Edge[]): Edge[] =>
  edges.map((e) => ({ parent: e.child, child: e.parent }));

/**
 * Foresta di una relazione «genitore → figlio». Le radici sono chi non ha genitori (o la radice scelta). Un nodo con più
 * genitori è espanso una sola volta, le altre compaiono come rimando; un ciclo si ferma quando torna su un nodo del percorso
 * (segnato `cycle`), quindi il calcolo termina sempre. Se restano nodi mai raggiunti (cicli senza radice) si parte dal
 * primo per titolo. L'attraversamento è iterativo: catene lunghe non fanno traboccare lo stack.
 */
export function buildForest(
  titles: ReadonlyMap<string, string>,
  edges: Edge[],
  options: { root?: string | null; maxNodes?: number } = {},
): Forest {
  const maxNodes = options.maxNodes ?? TREE_MAX_NODES;
  const seen = new Set<string>();
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  let hasCycle = false;
  for (const { parent, child } of edges) {
    if (!titles.has(parent) || !titles.has(child)) continue;
    const key = `${parent}\u0000${child}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(child);
    if (parent !== child) hasParent.add(child);
  }
  const node = (id: string, kind: TreeNode['kind']): TreeNode => ({
    id,
    title: titles.get(id) ?? '',
    kind,
    children: [],
  });
  const ordered = (ids: string[]) =>
    ids
      .map((id) => ({ id, title: titles.get(id) ?? '' }))
      .sort(compare)
      .map((x) => x.id);

  const expanded = new Set<string>();
  let count = 0;
  let truncated = false;

  function grow(rootId: string): TreeNode {
    const root = node(rootId, 'node');
    expanded.add(rootId);
    count++;
    // Pila di (nodo, elenco dei figli ancora da visitare); `path` sono gli antenati diretti per riconoscere i cicli.
    const path = new Set([rootId]);
    const stack: { node: TreeNode; todo: string[] }[] = [
      { node: root, todo: ordered(children.get(rootId) ?? []).reverse() },
    ];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const next = top.todo.pop();
      if (next === undefined) {
        path.delete(top.node.id);
        stack.pop();
        continue;
      }
      if (path.has(next)) {
        top.node.children.push(node(next, 'cycle'));
        hasCycle = true;
      } else if (expanded.has(next)) {
        top.node.children.push(node(next, 'repeat'));
      } else if (count >= maxNodes) {
        truncated = true;
        top.todo.length = 0;
      } else {
        const child = node(next, 'node');
        top.node.children.push(child);
        expanded.add(next);
        count++;
        path.add(next);
        stack.push({ node: child, todo: ordered(children.get(next) ?? []).reverse() });
      }
    }
    return root;
  }

  const inTree = new Set<string>();
  for (const [parent, kids] of children) {
    inTree.add(parent);
    for (const kid of kids) inTree.add(kid);
  }

  const roots: TreeNode[] = [];
  if (options.root) {
    if (titles.has(options.root)) roots.push(grow(options.root));
  } else {
    for (const id of ordered([...inTree].filter((id) => !hasParent.has(id)))) {
      if (expanded.has(id)) continue;
      if (count >= maxNodes) break;
      roots.push(grow(id));
    }
    // Cicli senza una radice vera: si parte dal primo nodo (per titolo) non ancora mostrato.
    for (const id of ordered([...inTree])) {
      if (!expanded.has(id) && count < maxNodes) roots.push(grow(id));
    }
    if ([...inTree].some((id) => !expanded.has(id))) truncated = true;
  }
  return { roots, count, edgeCount: seen.size, hasCycle, truncated };
}
