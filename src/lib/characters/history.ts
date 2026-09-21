/** Una voce della cronologia di una scheda, pronta da mostrare (il testo lo compone la pagina, con il catalogo messaggi). */
export type Change =
  | { type: 'name'; from: string; to: string }
  | { type: 'number'; label: string; from: string | null; to: string | null }
  | { type: 'edited'; label: string }
  | { type: 'notes' }
  | { type: 'owner' }
  | { type: 'kind' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const cell = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

/**
 * Legge `character_history.changes` (scritto dal trigger; qui lo si tratta comunque come dato esterno). Le chiavi hanno la
 * forma `nome`, `owner`, `kind`, `notes`, `attributes.<chiave>`, `resources.<chiave>`, `lists.<chiave>`, `text.<chiave>`;
 * `labels` traduce le chiavi dello schema nelle etichette (una chiave che non c'è più si mostra com'è).
 */
export function describeChanges(
  changes: unknown,
  labels: Readonly<Record<string, string>>,
): Change[] {
  if (!isRecord(changes)) return [];
  const out: Change[] = [];
  for (const [path, value] of Object.entries(changes).sort(([a], [b]) => a.localeCompare(b))) {
    if (path === 'name') {
      const pair = Array.isArray(value) ? value : [];
      out.push({ type: 'name', from: String(pair[0] ?? ''), to: String(pair[1] ?? '') });
    } else if (path === 'notes' || path === 'owner' || path === 'kind') {
      out.push({ type: path });
    } else {
      const dot = path.indexOf('.');
      if (dot < 0) continue;
      const section = path.slice(0, dot);
      const key = path.slice(dot + 1);
      const label = labels[key] ?? key;
      if ((section === 'attributes' || section === 'resources') && Array.isArray(value)) {
        out.push({ type: 'number', label, from: cell(value[0]), to: cell(value[1]) });
      } else if (
        section === 'lists' ||
        section === 'text' ||
        section === 'attributes' ||
        section === 'resources'
      ) {
        out.push({ type: 'edited', label });
      }
    }
  }
  return out;
}
