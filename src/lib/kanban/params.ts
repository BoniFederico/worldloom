export type KanbanParams = {
  /** `status` (bozza/definitivo) oppure la chiave di un campo a scelta; senza, la pagina chiede di sceglierlo. */
  by: string | null;
  /** Solo gli snippet di questa categoria. */
  category: string | null;
};

export const DEFAULT_KANBAN: KanbanParams = { by: null, category: null };

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Parametri della bacheca dalla query string: tutto è normalizzato, mai un errore. */
export function parseKanbanParams(raw: Raw): KanbanParams {
  const by = (first(raw.by) ?? '').trim();
  const category = (first(raw.category) ?? '').trim();
  return {
    by: KEY.test(by) ? by : null,
    category: UUID.test(category) ? category.toLowerCase() : null,
  };
}

/** Query string con i soli parametri diversi dai valori predefiniti. */
export function kanbanQuery(p: KanbanParams): string {
  const qs = new URLSearchParams();
  if (p.by) qs.set('by', p.by);
  if (p.category) qs.set('category', p.category);
  return qs.toString();
}

/** Configurazione salvata in una vista (jsonb, scrivibile anche da chi usa l'API): stessi limiti della query string. */
export function parseKanbanConfig(input: unknown): KanbanParams {
  const c =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return parseKanbanParams({ by: text(c.by), category: text(c.category) });
}
