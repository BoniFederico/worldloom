export type TreeParams = {
  /** Etichetta della relazione «genitore → figlio» (ad esempio «padre di»). */
  label: string | null;
  /** `down`: discendenti; `up`: antenati. */
  dir: 'down' | 'up';
  /** Titolo dello snippet da cui partire; senza, l'intera foresta. */
  root: string | null;
};

export const DEFAULT_TREE: TreeParams = { label: null, dir: 'down', root: null };

type Raw = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const clean = (value: string | undefined, max: number) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Parametri dell'albero dalla query string: tutto è normalizzato e limitato, mai un errore. */
export function parseTreeParams(raw: Raw): TreeParams {
  const label = clean(first(raw.label), 120);
  const root = clean(first(raw.root), 120);
  return {
    label: label || null,
    dir: first(raw.dir) === 'up' ? 'up' : 'down',
    root: root || null,
  };
}

/** Query string con i soli parametri diversi dai valori predefiniti. */
export function treeQuery(p: TreeParams): string {
  const qs = new URLSearchParams();
  if (p.label) qs.set('label', p.label);
  if (p.dir !== 'down') qs.set('dir', p.dir);
  if (p.root) qs.set('root', p.root);
  return qs.toString();
}

/** Configurazione salvata in una vista (jsonb, scrivibile anche da chi usa l'API): stessi limiti della query string. */
export function parseTreeConfig(input: unknown): TreeParams {
  const c =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return parseTreeParams({ label: text(c.label), dir: text(c.dir), root: text(c.root) });
}
