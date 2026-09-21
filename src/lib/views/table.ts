/** Configurazione, ordinamento e raggruppamento della vista tabella (logica pura, senza database). */

const FIXED = ['title', 'status', 'tags', 'categories', 'updated'] as const;
const FIELD_COLUMN = /^field:[a-z][a-z0-9_]{0,39}$/;
const MAX_COLUMNS = 12;

export type SortDir = 'asc' | 'desc';
export type TableConfig = {
  columns: string[];
  sort: { by: string; dir: SortDir };
  group: string | null;
};

export const DEFAULT_TABLE_CONFIG: TableConfig = {
  columns: ['title', 'status', 'categories', 'tags', 'updated'],
  sort: { by: 'title', dir: 'asc' },
  group: null,
};

const isColumn = (value: unknown): value is string =>
  typeof value === 'string' &&
  ((FIXED as readonly string[]).includes(value) || FIELD_COLUMN.test(value));

const isGroup = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value === 'status' || value === 'category' || FIELD_COLUMN.test(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Configurazione valida da qualsiasi input (il jsonb lo può scrivere anche chi usa l'API): mai un errore. */
export function parseTableConfig(input: unknown): TableConfig {
  const raw = isRecord(input) ? input : {};
  const columns: string[] = [];
  if (Array.isArray(raw.columns)) {
    for (const c of raw.columns) {
      if (isColumn(c) && !columns.includes(c) && columns.length < MAX_COLUMNS) columns.push(c);
    }
  }
  if (!columns.includes('title')) columns.unshift('title');
  const sort = isRecord(raw.sort) ? raw.sort : {};
  return {
    columns:
      columns.length > 1 || Array.isArray(raw.columns)
        ? columns.slice(0, MAX_COLUMNS)
        : [...DEFAULT_TABLE_CONFIG.columns],
    sort: {
      by: isColumn(sort.by) ? sort.by : DEFAULT_TABLE_CONFIG.sort.by,
      dir: sort.dir === 'desc' ? 'desc' : 'asc',
    },
    group: isGroup(raw.group) ? raw.group : null,
  };
}

/** Query string della pagina tabella per una configurazione. */
export function configQuery(config: TableConfig): string {
  const qs = new URLSearchParams();
  qs.set('cols', config.columns.join(','));
  qs.set('sort', config.sort.by);
  qs.set('dir', config.sort.dir);
  if (config.group) qs.set('group', config.group);
  return qs.toString();
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function configFromQuery(raw: Record<string, string | string[] | undefined>): TableConfig {
  const cols = Array.isArray(raw.cols) ? raw.cols.join(',') : raw.cols;
  return parseTableConfig({
    columns: cols ? cols.split(',').slice(0, 40) : undefined,
    sort: { by: first(raw.sort), dir: first(raw.dir) },
    group: first(raw.group),
  });
}

export type TableRow = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  updated_at: string;
  category_ids: string[];
  fields: Record<string, unknown>;
};

export type TableContext = {
  categories: Map<string, string>;
  fields: Map<string, { label: string; type: string }>;
};

const fieldKey = (column: string) => column.slice('field:'.length);

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v.year === 'number' && typeof v.month === 'number' && typeof v.day === 'number') {
      return `${v.day}/${v.month}/${v.year}`;
    }
    if (typeof v.path === 'string') return typeof v.alt === 'string' && v.alt ? v.alt : v.path;
    if (typeof v.x === 'number' && typeof v.y === 'number') return `${v.x}, ${v.y}`;
  }
  return '';
}

/** Testo di una cella (sempre testo semplice: la pagina lo mostra come nodo React, mai come HTML). */
export function cellText(row: TableRow, column: string, ctx: TableContext): string {
  switch (column) {
    case 'title':
      return row.title;
    case 'status':
      return row.status;
    case 'tags':
      return row.tags.join(', ');
    case 'categories':
      return row.category_ids.flatMap((id) => ctx.categories.get(id) ?? []).join(', ');
    case 'updated':
      return row.updated_at;
    default:
      return column.startsWith('field:') ? valueText(row.fields[fieldKey(column)]) : '';
  }
}

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

/** Chiave di ordinamento: numeri come numeri, date ISO come testo, il resto come testo; `null` se vuoto. */
function sortKey(row: TableRow, column: string, ctx: TableContext): number | string | null {
  if (column.startsWith('field:')) {
    const raw = row.fields[fieldKey(column)];
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return raw;
    const text = valueText(raw);
    return text === '' ? null : text;
  }
  const text = cellText(row, column, ctx);
  return text === '' ? null : text;
}

/** Ordina senza modificare l'array: i vuoti restano in fondo in entrambe le direzioni, a parità vale il titolo. */
export function sortRows(
  rows: TableRow[],
  sort: { by: string; dir: SortDir },
  ctx: TableContext,
): TableRow[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const ka = sortKey(a, sort.by, ctx);
    const kb = sortKey(b, sort.by, ctx);
    if (ka === null && kb !== null) return 1;
    if (kb === null && ka !== null) return -1;
    if (ka !== null && kb !== null && ka !== kb) {
      const cmp =
        typeof ka === 'number' && typeof kb === 'number'
          ? ka - kb
          : collator.compare(String(ka), String(kb));
      if (cmp !== 0) return sign * cmp;
    }
    return collator.compare(a.title, b.title);
  });
}

export type RowGroup = { key: string; label: string; rows: TableRow[] };

/** Raggruppa (dopo l'ordinamento): i gruppi sono in ordine alfabetico, quello senza valore va in fondo. */
export function groupRows(rows: TableRow[], group: string | null, ctx: TableContext): RowGroup[] {
  if (!group) return [{ key: '', label: '', rows }];
  const groups = new Map<string, RowGroup>();
  const add = (key: string, label: string, row: TableRow) => {
    const g = groups.get(key) ?? { key, label, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  };
  for (const row of rows) {
    if (group === 'status') {
      add(row.status, row.status, row);
    } else if (group === 'category') {
      const names = row.category_ids.flatMap((id) => (ctx.categories.has(id) ? [id] : []));
      if (names.length === 0) add('', '', row);
      for (const id of names) add(id, ctx.categories.get(id) as string, row);
    } else {
      const text = valueText(row.fields[fieldKey(group)]);
      add(text, text, row);
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.label === '' && b.label !== '') return 1;
    if (b.label === '' && a.label !== '') return -1;
    return collator.compare(a.label, b.label);
  });
}
