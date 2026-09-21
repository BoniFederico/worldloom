import {
  checkAttributeValues,
  computeSheet,
  defaultOf,
  type ValidSchema,
} from '@/lib/stats/compute';

/**
 * Valori di una scheda personaggio (#34), nella forma salvata in `characters.sheet`. Le chiavi sono quelle dello schema di
 * statistiche della campagna (#33); chiavi che lo schema non conosce (più) si ignorano alla lettura e non si riscrivono.
 */
export type Cell = string | number;
export type Row = Record<string, Cell>;
export type Sheet = {
  attributes: Record<string, number>;
  resources: Record<string, number>;
  lists: Record<string, Row[]>;
  text: Record<string, string>;
};

export const LIST_ROWS_MAX = 100;
export const CELL_MAX = 200;
export const TEXT_MAX = 20_000;
/** Righe vuote in più che il modulo offre per aggiungere voci a una lista. */
export const SPARE_ROWS = 3;

export type SheetErrorCode =
  'not_a_number' | 'not_integer' | 'out_of_range' | 'too_long' | 'too_many_rows';

export type SheetError = { field: string; code: SheetErrorCode };

export const SHEET_ERROR_CODES: readonly SheetErrorCode[] = [
  'not_a_number',
  'not_integer',
  'out_of_range',
  'too_long',
  'too_many_rows',
];

export const emptySheet = (): Sheet => ({ attributes: {}, resources: {}, lists: {}, text: {} });

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Legge i valori salvati (che arrivano dal database, quindi da non dare per buoni) tenendo solo ciò che lo schema prevede. */
export function readSheet(raw: unknown, valid: ValidSchema): Sheet {
  const { schema } = valid;
  const src = isRecord(raw) ? raw : {};
  const section = (name: string) =>
    isRecord(src[name]) ? (src[name] as Record<string, unknown>) : {};
  const sheet = emptySheet();

  for (const a of schema.attributes) {
    const v = section('attributes')[a.key];
    if (typeof v === 'number' && Number.isFinite(v)) sheet.attributes[a.key] = v;
  }
  for (const r of schema.resources) {
    const v = section('resources')[r.key];
    if (typeof v === 'number' && Number.isFinite(v)) sheet.resources[r.key] = v;
  }
  for (const l of schema.lists) {
    const rows = section('lists')[l.key];
    if (!Array.isArray(rows)) continue;
    sheet.lists[l.key] = rows.slice(0, LIST_ROWS_MAX).flatMap((row) => {
      if (!isRecord(row)) return [];
      const out: Row = {};
      for (const col of Object.keys(l.item)) {
        const v = row[col];
        if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[col] = v;
      }
      return [out];
    });
  }
  for (const t of schema.text) {
    const v = section('text')[t.key];
    if (typeof v === 'string') sheet.text[t.key] = v;
  }
  return sheet;
}

/** Nomi dei campi del modulo: `attr:<chiave>`, `res:<chiave>`, `list:<chiave>:<riga>:<colonna>`, `text:<chiave>`. */
export const fieldName = {
  attribute: (key: string) => `attr:${key}`,
  resource: (key: string) => `res:${key}`,
  cell: (key: string, row: number, col: string) => `list:${key}:${row}:${col}`,
  text: (key: string) => `text:${key}`,
};

const clean = (v: string | undefined) => (v ?? '').replace(/\r\n/g, '\n').trim();

function parseNumber(text: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export type SheetForm = { ok: true; sheet: Sheet } | { ok: false; errors: SheetError[] };

/**
 * Valori dal modulo (`get` legge un campo per nome). Un attributo vuoto prende il predefinito; una risorsa vuota è al massimo;
 * una riga di lista con tutte le celle vuote sparisce. Controlla tipo, intervallo e limiti; le risorse non possono superare il
 * massimo calcolato con gli attributi appena inseriti.
 */
export function parseSheetForm(
  valid: ValidSchema,
  get: (name: string) => string | undefined,
): SheetForm {
  const { schema } = valid;
  const errors: SheetError[] = [];
  const sheet = emptySheet();

  const given: Record<string, unknown> = {};
  for (const a of schema.attributes) {
    const text = clean(get(fieldName.attribute(a.key)));
    if (text === '') {
      sheet.attributes[a.key] = defaultOf(a);
      continue;
    }
    const n = parseNumber(text);
    if (n === null) errors.push({ field: a.key, code: 'not_a_number' });
    else {
      given[a.key] = n;
      sheet.attributes[a.key] = n;
    }
  }
  for (const e of checkAttributeValues(schema, given)) errors.push({ field: e.key, code: e.code });

  const computed = computeSheet(valid, sheet.attributes);
  for (const r of schema.resources) {
    const max = computed.max[r.key];
    const text = clean(get(fieldName.resource(r.key)));
    if (text === '') {
      sheet.resources[r.key] = max ?? 0;
      continue;
    }
    const n = parseNumber(text);
    if (n === null) errors.push({ field: r.key, code: 'not_a_number' });
    else if (n < 0 || (max !== null && max !== undefined && n > max)) {
      errors.push({ field: r.key, code: 'out_of_range' });
    } else sheet.resources[r.key] = n;
  }

  for (const l of schema.lists) {
    const rows: Row[] = [];
    const cols = Object.entries(l.item);
    for (let i = 0; i < LIST_ROWS_MAX + SPARE_ROWS + 1; i++) {
      const cells = cols.map(([col]) => get(fieldName.cell(l.key, i, col)));
      if (cells.every((c) => c === undefined)) break;
      const row: Row = {};
      let empty = true;
      cols.forEach(([col, type], n) => {
        const text = clean(cells[n]);
        if (text === '') return;
        empty = false;
        if (type === 'text') {
          if (text.length > CELL_MAX) errors.push({ field: l.key, code: 'too_long' });
          else row[col] = text;
          return;
        }
        const num = parseNumber(text);
        if (num === null) errors.push({ field: l.key, code: 'not_a_number' });
        else if (type === 'integer' && !Number.isInteger(num)) {
          errors.push({ field: l.key, code: 'not_integer' });
        } else row[col] = num;
      });
      if (!empty) rows.push(row);
    }
    if (rows.length > LIST_ROWS_MAX) errors.push({ field: l.key, code: 'too_many_rows' });
    else sheet.lists[l.key] = rows;
  }

  for (const t of schema.text) {
    const text = clean(get(fieldName.text(t.key)));
    if (text.length > TEXT_MAX) errors.push({ field: t.key, code: 'too_long' });
    else if (text !== '') sheet.text[t.key] = text;
  }

  return errors.length ? { ok: false, errors } : { ok: true, sheet };
}
