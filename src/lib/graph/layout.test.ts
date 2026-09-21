import { describe, expect, it } from 'vitest';
import { graphSize, layoutGraph } from './layout';

const box = { width: 800, height: 600 };

const ring = (n: number) => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
  edges: Array.from({ length: n }, (_, i) => ({ source: `n${i}`, target: `n${(i + 1) % n}` })),
});

describe('layoutGraph', () => {
  it('senza nodi restituisce una mappa vuota e con un nodo lo mette al centro', () => {
    expect(layoutGraph([], [], box).size).toBe(0);
    const one = layoutGraph([{ id: 'a' }], [], box);
    expect(one.get('a')).toEqual({ x: 400, y: 300 });
  });

  it('è deterministico: stesso grafo, stesse posizioni', () => {
    const { nodes, edges } = ring(12);
    const a = layoutGraph(nodes, edges, box);
    const b = layoutGraph(nodes, edges, box);
    expect([...a]).toEqual([...b]);
  });

  it('tiene tutti i nodi dentro l’area, con un margine, e con coordinate finite', () => {
    const { nodes, edges } = ring(60);
    for (const { x, y } of layoutGraph(nodes, edges, box).values()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThanOrEqual(box.width - 24);
      expect(y).toBeGreaterThanOrEqual(24);
      expect(y).toBeLessThanOrEqual(box.height - 24);
    }
  });

  it('i nodi non si sovrappongono', () => {
    const { nodes, edges } = ring(40);
    const pos = [...layoutGraph(nodes, edges, box).values()];
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        min = Math.min(min, Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y));
      }
    }
    expect(min).toBeGreaterThan(8);
  });

  it('il nodo centrale resta fisso al centro', () => {
    const { nodes, edges } = ring(10);
    const pos = layoutGraph(nodes, edges, box, { pinned: 'n3' });
    expect(pos.get('n3')).toEqual({ x: 400, y: 300 });
  });

  it('i nodi collegati finiscono in media più vicini di quelli non collegati', () => {
    const { nodes, edges } = ring(30);
    const pos = layoutGraph(nodes, edges, box);
    const d = (a: string, b: string) =>
      Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y);
    const linked = edges.reduce((s, e) => s + d(e.source, e.target), 0) / edges.length;
    let far = 0;
    let count = 0;
    for (let i = 0; i < 30; i++) {
      far += d(`n${i}`, `n${(i + 15) % 30}`);
      count++;
    }
    expect(linked).toBeLessThan(far / count);
  });

  it('ignora archi verso nodi assenti e archi su se stessi', () => {
    const pos = layoutGraph(
      [{ id: 'a' }, { id: 'b' }],
      [
        { source: 'a', target: 'zzz' },
        { source: 'a', target: 'a' },
        { source: 'a', target: 'b' },
      ],
      box,
    );
    expect(pos.size).toBe(2);
    for (const { x, y } of pos.values()) expect(Number.isFinite(x + y)).toBe(true);
  });

  it('gestisce 300 nodi e 600 archi in tempi brevi', () => {
    const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 600 }, (_, i) => ({
      source: `n${i % 300}`,
      target: `n${(i * 7 + 1) % 300}`,
    }));
    const start = performance.now();
    layoutGraph(nodes, edges, { width: 1200, height: 800 });
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('grafi densi', () => {
  it('l’area cresce con il numero di nodi, ma resta limitata', () => {
    expect(graphSize(10)).toEqual({ width: 960, height: 600 });
    const big = graphSize(300);
    expect(big.width).toBeGreaterThan(960);
    expect(big.width).toBeLessThanOrEqual(960 * 3);
    expect(graphSize(100000).width).toBeLessThanOrEqual(960 * 3);
  });

  it('con 300 nodi quasi nessuno resta schiacciato sul bordo e i punti non coincidono', () => {
    const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 1200 }, (_, i) => ({
      source: `n${i % 300}`,
      target: `n${(i * 37 + 11) % 300}`,
    }));
    const size = graphSize(300);
    const pos = [...layoutGraph(nodes, edges, size).values()];
    const onEdge = pos.filter(
      (q) => q.x <= 25 || q.y <= 25 || q.x >= size.width - 25 || q.y >= size.height - 25,
    );
    expect(onEdge.length / pos.length).toBeLessThan(0.12);
    const distinct = new Set(pos.map((q) => `${Math.round(q.x / 6)}:${Math.round(q.y / 6)}`));
    expect(distinct.size / pos.length).toBeGreaterThan(0.9);
  });
});
