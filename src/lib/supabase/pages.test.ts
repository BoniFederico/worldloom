import { describe, expect, it } from 'vitest';
import { readPages } from './pages';

/** Finto servizio che, come Supabase, non restituisce mai più di `cap` righe per richiesta. */
const source = (total: number, cap = 1000) => {
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1, total - 1);
    return {
      data: from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i),
      error: null,
    };
  };
  return { fetchPage, calls };
};

describe('readPages', () => {
  it('legge oltre le 1000 righe con più richieste', async () => {
    const { fetchPage, calls } = source(2500);
    const r = await readPages(fetchPage, 5000);
    expect(r?.rows).toHaveLength(2500);
    expect(r?.truncated).toBe(false);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('si ferma al tetto e lo segnala', async () => {
    const { fetchPage } = source(10_000);
    const r = await readPages(fetchPage, 2500);
    expect(r?.rows).toHaveLength(2500);
    expect(r?.truncated).toBe(true);
  });

  it('un totale esattamente pari a una pagina, o vuoto, non si segnala come troncato', async () => {
    expect((await readPages(source(999).fetchPage, 5000))?.truncated).toBe(false);
    expect((await readPages(source(0).fetchPage, 5000))?.rows).toEqual([]);
  });

  it('un errore di una richiesta dà null', async () => {
    const r = await readPages(async () => ({ data: null, error: new Error('x') }), 5000);
    expect(r).toBeNull();
  });
});
