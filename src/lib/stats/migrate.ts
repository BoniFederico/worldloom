import { computeSheet, type ValidSchema } from './compute';
import { readSheet, type Row, type Sheet } from '@/lib/characters/sheet';
import type { StatsSchema } from './schema';

/**
 * Migrazione delle schede esistenti quando cambia lo schema di statistiche (#35). Funzioni pure: da lo schema vecchio, quello
 * nuovo e le schede, calcolano che cosa si perderebbe, dove si possono spostare i valori e come diventa ogni scheda. L'app le
 * applica poi in un'unica operazione (`apply_stats_migration`).
 */

export const SECTIONS = ['attributes', 'resources', 'lists', 'text'] as const;
export type Section = (typeof SECTIONS)[number];

/** Riferimento a un campo: `attributes.str`, `lists.inventory`… */
export const refOf = (section: Section, key: string) => `${section}.${key}`;

export type SheetRow = { id: string; rev: number; sheet: unknown };

export type SchemaDiff = { removed: string[]; added: string[] };

const keysOf = (schema: StatsSchema): Record<Section, string[]> => ({
  attributes: schema.attributes.map((a) => a.key),
  resources: schema.resources.map((r) => r.key),
  lists: schema.lists.map((l) => l.key),
  text: schema.text.map((t) => t.key),
});

/** Chiavi che il nuovo schema non ha più e chiavi nuove, per sezione (una chiave che cambia sezione conta come tolta e aggiunta). */
export function diffSchemas(oldSchema: StatsSchema, newSchema: StatsSchema): SchemaDiff {
  const a = keysOf(oldSchema);
  const b = keysOf(newSchema);
  const removed: string[] = [];
  const added: string[] = [];
  for (const s of SECTIONS) {
    for (const k of a[s]) if (!b[s].includes(k)) removed.push(refOf(s, k));
    for (const k of b[s]) if (!a[s].includes(k)) added.push(refOf(s, k));
  }
  return { removed, added };
}

export type Removed = { ref: string; section: Section; key: string; sheets: number };

export type Plan =
  | {
      ok: true;
      /** Solo le schede che cambiano, con la revisione letta (serve a rilevare un salvataggio concorrente). */
      sheets: { id: string; rev: number; sheet: Sheet }[];
      /** Campi tolti che hanno un valore in almeno una scheda, con il numero di schede. */
      removed: Removed[];
      moved: number;
      dropped: number;
      /** Valori riportati nei nuovi limiti o convertiti con perdita. */
      clamped: number;
    }
  | { ok: false; error: 'invalid_move' };

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([x], [y]) => x.localeCompare(y)))
      : val,
  );

const CELL_MAX = 200;

/** Cella nel nuovo tipo di colonna; `null` se non è convertibile. */
function convertCell(
  value: string | number,
  type: 'text' | 'integer' | 'number',
): string | number | null {
  if (type === 'text') return String(value).slice(0, CELL_MAX);
  const n =
    typeof value === 'number' ? value : /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return type === 'integer' ? Math.round(n) : n;
}

/**
 * Nuova scheda da quella vecchia. `moves` associa un campo tolto (`attributes.wis`) a una chiave nuova della stessa sezione
 * (`sag`) o a `null` (elimina i valori); un campo tolto senza indicazione si elimina. Ogni spostamento deve andare su una chiave
 * aggiunta (mai su una che già ha i suoi valori) e due origini non possono avere la stessa destinazione.
 */
export function planMigration(
  oldValid: ValidSchema,
  newValid: ValidSchema,
  rows: readonly SheetRow[],
  moves: Readonly<Record<string, string | null>>,
): Plan {
  const oldS = oldValid.schema;
  const newS = newValid.schema;
  const diff = diffSchemas(oldS, newS);

  // Spostamenti validi: origine tolta, destinazione aggiunta nella stessa sezione, destinazioni distinte.
  const target = new Map<string, string>();
  const used = new Set<string>();
  for (const [from, to] of Object.entries(moves)) {
    if (to === null || to === '') continue;
    const section = SECTIONS.find((s) => from.startsWith(`${s}.`));
    if (
      !section ||
      !diff.removed.includes(from) ||
      !diff.added.includes(refOf(section, to)) ||
      used.has(refOf(section, to))
    ) {
      return { ok: false, error: 'invalid_move' };
    }
    used.add(refOf(section, to));
    target.set(from, to);
  }
  for (const from of Object.keys(moves)) {
    if (!diff.removed.includes(from) && moves[from] !== null && moves[from] !== '') {
      return { ok: false, error: 'invalid_move' };
    }
  }

  const removedCount = new Map<string, number>();
  const out: { id: string; rev: number; sheet: Sheet }[] = [];
  let moved = 0;
  let dropped = 0;
  let clamped = 0;

  for (const row of rows) {
    const old = readSheet(row.sheet, oldValid);
    const next: Sheet = { attributes: {}, resources: {}, lists: {}, text: {} };

    // Attributi: si tengono le chiavi ancora presenti (o le nuove destinazioni), arrotondando e riportando nei limiti.
    const attrDef = new Map(newS.attributes.map((a) => [a.key, a]));
    const placeAttr = (key: string, value: number) => {
      const def = attrDef.get(key)!;
      let v = def.type === 'integer' ? Math.round(value) : value;
      if (def.min !== undefined) v = Math.max(def.min, v);
      if (def.max !== undefined) v = Math.min(def.max, v);
      if (v !== value) clamped++;
      next.attributes[key] = v;
    };
    for (const [key, value] of Object.entries(old.attributes)) {
      const from = refOf('attributes', key);
      if (attrDef.has(key)) placeAttr(key, value);
      else countRemoved(from, target.get(from), () => placeAttr(target.get(from)!, value));
    }

    // Risorse: si riportano al massimo calcolato con gli attributi nuovi.
    const resDef = new Set(newS.resources.map((r) => r.key));
    const maxes = computeSheet(newValid, next.attributes).max;
    const placeRes = (key: string, value: number) => {
      const max = maxes[key];
      let v = Math.max(0, value);
      if (max !== null && max !== undefined) v = Math.min(max, v);
      if (v !== value) clamped++;
      next.resources[key] = v;
    };
    for (const [key, value] of Object.entries(old.resources)) {
      const from = refOf('resources', key);
      if (resDef.has(key)) placeRes(key, value);
      else countRemoved(from, target.get(from), () => placeRes(target.get(from)!, value));
    }

    // Liste: colonne che esistono ancora, con il tipo nuovo.
    const listDef = new Map(newS.lists.map((l) => [l.key, l.item]));
    const placeList = (key: string, rowsIn: Row[]) => {
      const item = listDef.get(key)!;
      next.lists[key] = rowsIn.map((r) => {
        const cells: Row = {};
        for (const [col, value] of Object.entries(r)) {
          const type = item[col];
          if (!type) {
            clamped++;
            continue;
          }
          const c = convertCell(value, type);
          if (c === null || c !== value) clamped++;
          if (c !== null) cells[col] = c;
        }
        return cells;
      });
    };
    for (const [key, rowsIn] of Object.entries(old.lists)) {
      const from = refOf('lists', key);
      if (listDef.has(key)) placeList(key, rowsIn);
      else
        countRemoved(
          from,
          target.get(from),
          () => placeList(target.get(from)!, rowsIn),
          rowsIn.length > 0,
        );
    }

    // Testi.
    const textDef = new Set(newS.text.map((t) => t.key));
    for (const [key, value] of Object.entries(old.text)) {
      const from = refOf('text', key);
      if (textDef.has(key)) next.text[key] = value;
      else countRemoved(from, target.get(from), () => (next.text[target.get(from)!] = value));
    }

    if (stable(next) !== stable(old)) out.push({ id: row.id, rev: row.rev, sheet: next });
  }

  function countRemoved(ref: string, to: string | undefined, place: () => void, hasValue = true) {
    if (!hasValue) return;
    removedCount.set(ref, (removedCount.get(ref) ?? 0) + 1);
    if (to === undefined) dropped++;
    else {
      moved++;
      place();
    }
  }

  const removed: Removed[] = diff.removed.flatMap((ref) => {
    const sheets = removedCount.get(ref) ?? 0;
    if (!sheets) return [];
    const section = SECTIONS.find((s) => ref.startsWith(`${s}.`))!;
    return [{ ref, section, key: ref.slice(section.length + 1), sheets }];
  });
  return { ok: true, sheets: out, removed, moved, dropped, clamped };
}

export type MigrationItem = {
  ref: string;
  label: string;
  /** Schede che hanno un valore per questo campo. */
  sheets: number;
  /** Chiavi nuove della stessa sezione su cui spostare i valori. */
  targets: { key: string; label: string }[];
  /** Destinazione proposta: la chiave nuova con la stessa etichetta, se c'è (altrimenti vuoto = elimina). */
  suggestion: string;
};

export type MigrationInfo = {
  items: MigrationItem[];
  sheetsChanged: number;
  clamped: number;
};

type Named = { key: string; label: string };
const namedOf = (schema: StatsSchema): Record<Section, Named[]> => ({
  attributes: schema.attributes,
  resources: schema.resources,
  lists: schema.lists,
  text: schema.text,
});

/** Che cosa mostrare al DM prima di applicare la migrazione: i campi tolti con valori, dove spostarli e quante schede cambiano. */
export function describeMigration(
  oldSchema: StatsSchema,
  newSchema: StatsSchema,
  plan: Extract<Plan, { ok: true }>,
): MigrationInfo {
  const before = namedOf(oldSchema);
  const after = namedOf(newSchema);
  const diff = diffSchemas(oldSchema, newSchema);
  return {
    sheetsChanged: plan.sheets.length,
    clamped: plan.clamped,
    items: plan.removed.map((r) => {
      const targets = after[r.section].filter((f) => diff.added.includes(refOf(r.section, f.key)));
      const label = before[r.section].find((f) => f.key === r.key)?.label ?? r.key;
      const same = targets.filter(
        (t) => t.label.trim().toLowerCase() === label.trim().toLowerCase(),
      );
      return {
        ref: r.ref,
        label,
        sheets: r.sheets,
        targets: targets.map((t) => ({ key: t.key, label: t.label })),
        suggestion: same.length === 1 ? same[0]!.key : '',
      };
    }),
  };
}
