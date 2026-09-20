import { uuidSchema } from '@/lib/worlds/schemas';

export type TimePoint = { calendar: 'default'; year: number; month?: number; day?: number };

export type RelationInput = {
  target: string;
  label: string;
  inverse: string | null;
  notes: string;
  from: TimePoint | null;
  to: TimePoint | null;
};

export type RelationError =
  'invalid_target' | 'invalid_label' | 'invalid_notes' | 'invalid_validity';

export type RelationResult =
  { ok: true; value: RelationInput } | { ok: false; error: RelationError };

const MAX_LABEL = 120;
const MAX_NOTES = 2000;
const MAX_YEAR = 999_999_999;

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

function int(value: string, min: number, max: number): number | null {
  if (!/^-?\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/**
 * Un momento (anno, con mese e giorno facoltativi) da tre campi di un form. Tutti vuoti → nessun limite.
 * Il calendario è «default» finché non esistono i calendari personalizzati (#26).
 */
function timePoint(
  get: (name: string) => string | undefined,
  prefix: string,
): TimePoint | null | undefined {
  const [year, month, day] = ['year', 'month', 'day'].map((k) => clean(get(`${prefix}_${k}`)));
  if (!year && !month && !day) return null;
  if (!year) return undefined; // mese o giorno senza anno
  const y = int(year, -MAX_YEAR, MAX_YEAR);
  if (y === null) return undefined;
  const point: TimePoint = { calendar: 'default', year: y };
  if (month) {
    const m = int(month, 1, 99);
    if (m === null) return undefined;
    point.month = m;
  }
  if (day) {
    if (!month) return undefined; // il giorno richiede il mese
    const d = int(day, 1, 99);
    if (d === null) return undefined;
    point.day = d;
  }
  return point;
}

/** Il primo momento non è dopo il secondo (confronto sui campi presenti in entrambi). */
function inOrder(a: TimePoint, b: TimePoint): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month === undefined || b.month === undefined) return true;
  if (a.month !== b.month) return a.month < b.month;
  if (a.day === undefined || b.day === undefined) return true;
  return a.day <= b.day;
}

export function parseRelationInput(get: (name: string) => string | undefined): RelationResult {
  const target = uuidSchema.safeParse(clean(get('target')));
  if (!target.success) return { ok: false, error: 'invalid_target' };

  const label = clean(get('label'));
  const inverse = clean(get('inverse'));
  if (!label || label.length > MAX_LABEL || inverse.length > MAX_LABEL) {
    return { ok: false, error: 'invalid_label' };
  }

  const notes = (get('notes') ?? '').replace(/\r\n?/g, '\n').trim();
  if (notes.length > MAX_NOTES) return { ok: false, error: 'invalid_notes' };

  const from = timePoint(get, 'from');
  const to = timePoint(get, 'to');
  if (from === undefined || to === undefined || (from && to && !inOrder(from, to))) {
    return { ok: false, error: 'invalid_validity' };
  }

  return {
    ok: true,
    value: { target: target.data, label, inverse: inverse || null, notes, from, to },
  };
}

export type RelationRow = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  inverse_label: string | null;
};

export type RelationView = {
  id: string;
  /** L'altro snippet della relazione. */
  otherId: string;
  /** `out`: questo snippet è l'origine; `in`: è la destinazione. */
  direction: 'out' | 'in';
  /** Etichetta da mostrare davanti all'altro snippet, letta dal punto di vista di questo. */
  label: string;
  /** Vero se in ingresso e senza etichetta inversa: la frase va costruita con l'etichetta originale. */
  reversed: boolean;
};

/** Legge una relazione dal punto di vista di `snippetId`: in uscita l'etichetta, in ingresso l'inversa (se c'è). */
export function relationView(row: RelationRow, snippetId: string): RelationView {
  if (row.source_id === snippetId) {
    return {
      id: row.id,
      otherId: row.target_id,
      direction: 'out',
      label: row.label,
      reversed: false,
    };
  }
  return {
    id: row.id,
    otherId: row.source_id,
    direction: 'in',
    label: row.inverse_label ?? row.label,
    reversed: row.inverse_label === null,
  };
}

/** Etichette già usate nel mondo, dalla più frequente, per i suggerimenti. */
export function topLabels(values: (string | null)[], limit = 30): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const value of values) {
    if (!value) continue;
    const key = value.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { label: value, n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => e.label);
}

const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Etichetta inversa da riusare per `label`, in base alle relazioni già presenti (dalla più recente):
 * se `label` è già usata con un'inversa si riusa quella; se `label` è a sua volta l'inversa di un'altra
 * etichetta, l'inversa è quell'altra («padre di» dopo «figlio di» ↔ «padre di»).
 */
export function inverseFor(
  label: string,
  rows: { label: string; inverse_label: string | null }[],
): string | null {
  const key = norm(label);
  for (const row of rows) {
    if (row.inverse_label && norm(row.label) === key) return row.inverse_label;
    if (row.inverse_label && norm(row.inverse_label) === key) return row.label;
  }
  return null;
}
