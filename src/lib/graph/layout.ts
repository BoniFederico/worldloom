export type LayoutNode = { id: string };
export type LayoutEdge = { source: string; target: string };
export type Point = { x: number; y: number };

const MARGIN = 24;
const BASE_WIDTH = 960;
const BASE_HEIGHT = 600;
const MAX_SCALE = 3;
const REPULSION_RANGE = 2.2;

/** Area del disegno: cresce con la radice del numero di nodi (densità costante), fino a un massimo. */
export function graphSize(nodeCount: number): { width: number; height: number } {
  const scale = Math.min(MAX_SCALE, Math.max(1, Math.sqrt(nodeCount / 40)));
  return { width: Math.round(BASE_WIDTH * scale), height: Math.round(BASE_HEIGHT * scale) };
}

/**
 * Disposizione dei nodi con un modello a forze (Fruchterman–Reingold), deterministica: le posizioni iniziali sono su una
 * spirale in ordine di id e non c'è nessun elemento casuale, quindi lo stesso grafo dà sempre lo stesso disegno (utile per
 * i link stabili e per i test). Il calcolo avviene sul server: il client riceve un SVG già pronto, nessuna libreria di grafi.
 * Costo O(iterazioni × nodi²): con il tetto di 500 nodi resta sotto il secondo.
 */
export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  size: { width: number; height: number },
  options: { pinned?: string; iterations?: number } = {},
): Map<string, Point> {
  const out = new Map<string, Point>();
  const n = nodes.length;
  const cx = size.width / 2;
  const cy = size.height / 2;
  if (n === 0) return out;
  if (n === 1) return out.set(nodes[0]!.id, { x: cx, y: cy });

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links: [number, number][] = [];
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  const pinned = options.pinned === undefined ? -1 : (index.get(options.pinned) ?? -1);

  const w = size.width - 2 * MARGIN;
  const h = size.height - 2 * MARGIN;
  const area = w * h;
  const k = Math.sqrt(area / n) * 0.9; // distanza ideale tra due nodi
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  // Spirale di Vogel: distribuzione uniforme e ripetibile.
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n) * Math.min(w, h) * 0.45;
    const angle = i * 2.399963229728653;
    x[i] = cx + r * Math.cos(angle);
    y[i] = cy + r * Math.sin(angle);
  }
  if (pinned >= 0) {
    x[pinned] = cx;
    y[pinned] = cy;
  }

  const iterations = options.iterations ?? (n > 250 ? 90 : 160);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = Math.min(w, h) / 8;
  const cooling = temperature / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i]! - x[j]!;
        let ddy = y[i]! - y[j]!;
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          // Nodi sovrapposti: spinta minima in una direzione che dipende dall'indice (mai casuale).
          ddx = 0.01 * ((i % 7) - 3 || 1);
          ddy = 0.01 * ((j % 5) - 2 || 1);
          dist = Math.hypot(ddx, ddy);
        }
        // Repulsione a raggio finito: con raggio infinito la somma delle spinte porta quasi tutti i nodi sul bordo.
        if (dist > REPULSION_RANGE * k) continue;
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }
    for (const [a, b] of links) {
      const ddx = x[a]! - x[b]!;
      const ddy = y[a]! - y[b]!;
      const dist = Math.max(Math.hypot(ddx, ddy), 0.01);
      const force = (dist * dist) / k;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }
    for (let i = 0; i < n; i++) {
      if (i === pinned) continue;
      // Leggera attrazione verso il centro: le componenti sconnesse non fuggono verso i bordi.
      dx[i]! += (cx - x[i]!) * 0.05;
      dy[i]! += (cy - y[i]!) * 0.05;
      const len = Math.max(Math.hypot(dx[i]!, dy[i]!), 0.01);
      const step = Math.min(len, temperature);
      x[i]! += (dx[i]! / len) * step;
      y[i]! += (dy[i]! / len) * step;
      x[i] = Math.min(size.width - MARGIN, Math.max(MARGIN, x[i]!));
      y[i] = Math.min(size.height - MARGIN, Math.max(MARGIN, y[i]!));
    }
    temperature -= cooling;
  }

  nodes.forEach((node, i) => out.set(node.id, { x: x[i]!, y: y[i]! }));
  return out;
}
