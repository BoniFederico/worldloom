export type VersionContent = {
  title: string;
  status: string;
  body: unknown;
  fields: unknown;
  tags: string[];
  aliases: string[];
};

export type DiffLine = { type: 'same' | 'add' | 'remove'; text: string };

/** Oltre questo numero di celle la ricerca della sottosequenza comune diventa troppo costosa. */
const MAX_CELLS = 4_000_000;

const split = (text: string) => (text === '' ? [] : text.split('\n'));

/** Confronto riga per riga (sottosequenza comune più lunga), con ordine originale preservato. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = split(before);
  const b = split(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffLine[] = a.slice(0, start).map((text) => ({ type: 'same', text }));
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ type: 'same', text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const middle: DiffLine[] = [];
  const n = midA.length;
  const m = midB.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (const text of midA) middle.push({ type: 'remove', text });
    for (const text of midB) middle.push({ type: 'add', text });
  } else {
    // lcs[i][j]: lunghezza della sottosequenza comune di midA[i..] e midB[j..].
    const width = m + 1;
    const lcs = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * width + j] =
          (midA[i] as string) === (midB[j] as string)
            ? (lcs[(i + 1) * width + j + 1] as number) + 1
            : Math.max(lcs[(i + 1) * width + j] as number, lcs[i * width + j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if ((midA[i] as string) === (midB[j] as string)) {
        middle.push({ type: 'same', text: midA[i] as string });
        i++;
        j++;
      } else if ((lcs[(i + 1) * width + j] as number) >= (lcs[i * width + j + 1] as number)) {
        middle.push({ type: 'remove', text: midA[i++] as string });
      } else {
        middle.push({ type: 'add', text: midB[j++] as string });
      }
    }
    while (i < n) middle.push({ type: 'remove', text: midA[i++] as string });
    while (j < m) middle.push({ type: 'add', text: midB[j++] as string });
  }
  return [...head, ...middle, ...tail];
}

export function diffList(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  return {
    added: after.filter((x) => !before.includes(x)),
    removed: before.filter((x) => !after.includes(x)),
  };
}

export type FieldChange = { key: string; before: unknown; after: unknown };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Campi personalizzati aggiunti, rimossi o cambiati (valori strutturati confrontati per contenuto). */
export function diffFields(before: unknown, after: unknown): FieldChange[] {
  const a = asRecord(before);
  const b = asRecord(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys
    .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
    .map((key) => ({ key, before: a[key], after: b[key] }));
}
