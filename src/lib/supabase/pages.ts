/** Righe per richiesta: il servizio taglia in silenzio a `max_rows` (1000 di predefinito), quindi non si chiede di più. */
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };

/**
 * Legge fino a `max` righe con più richieste `range(da, a)`, finché una pagina arriva incompleta. `truncated` dice se
 * il tetto è stato raggiunto (ce ne potrebbero essere altre). `null` se una richiesta fallisce.
 */
export async function readPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
  max: number,
  pageSize = PAGE_SIZE,
): Promise<{ rows: T[]; truncated: boolean } | null> {
  const rows: T[] = [];
  while (rows.length < max) {
    const size = Math.min(pageSize, max - rows.length);
    const { data, error } = await fetchPage(rows.length, rows.length + size - 1);
    if (error) return null;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < size) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
