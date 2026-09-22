import type { ImportPlan } from '@/lib/export/world';
import { validateValue, type FieldDefinition } from '@/lib/fields/fields';
import { EMPTY_DOC } from '@/lib/snippets/body';

export const MAX_CSV_ROWS = 5000;
const TITLE_HEADERS = new Set(['title', 'titolo', 'nome', 'name']);

/** Trasforma un'intestazione in una chiave di campo valida (`^[a-z][a-z0-9_]{0,39}$`), unica nel foglio. */
function fieldKey(header: string, index: number, used: Set<string>): string {
  let key = header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!/^[a-z]/.test(key)) key = `c${key}`.slice(0, 40);
  if (!key) key = `campo_${index}`;
  let candidate = key;
  let n = 1;
  while (used.has(candidate)) candidate = `${key.slice(0, 36)}_${++n}`;
  used.add(candidate);
  return candidate;
}

/**
 * Piano di importazione da un file CSV: la prima riga sono le intestazioni, la colonna del titolo (`title`,
 * `titolo`, `nome`... altrimenti la prima) diventa il titolo dello snippet, le altre colonne diventano campi di
 * testo di un'unica categoria generata per l'occasione. Nessuna relazione: un CSV è una tabella piatta.
 */
export function planCsvImport(
  worldName: string,
  categoryName: string,
  rows: string[][],
  newId: () => string,
): ImportPlan {
  if (rows.length < 2) return { ok: false, error: 'servono un’intestazione e almeno una riga' };
  if (rows.length - 1 > MAX_CSV_ROWS) return { ok: false, error: 'troppe righe' };

  const headers = rows[0] ?? [];
  const titleIndex = Math.max(
    0,
    headers.findIndex((h) => TITLE_HEADERS.has(h.trim().toLowerCase())),
  );
  const used = new Set<string>();
  const fields: { index: number; def: FieldDefinition }[] = headers
    .map((header, index) => ({ header, index }))
    .filter((h) => h.index !== titleIndex)
    .map(({ header, index }) => ({
      index,
      def: {
        key: fieldKey(header.trim() || `campo_${index}`, index, used),
        label: header.trim().slice(0, 80) || `Campo ${index + 1}`,
        type: 'text' as const,
      },
    }));

  const categoryId = newId();
  const now = new Date().toISOString();
  const snippets: Extract<ImportPlan, { ok: true }>['snippets'] = [];
  const snippetCategories: Extract<ImportPlan, { ok: true }>['snippetCategories'] = [];

  for (const row of rows.slice(1)) {
    const title = (row[titleIndex] ?? '').trim();
    if (!title) continue;
    const id = newId();
    const values: Record<string, unknown> = {};
    for (const { index, def } of fields) {
      const raw = (row[index] ?? '').trim();
      if (!raw) continue;
      const result = validateValue(def, raw);
      if (result.ok) values[def.key] = result.value;
    }
    snippets.push({
      id,
      title: title.slice(0, 300),
      status: 'draft',
      visibility: 'members',
      archived_at: null,
      tags: [],
      aliases: [],
      fields: values,
      body: EMPTY_DOC,
      created_at: now,
    });
    snippetCategories.push({ snippet_id: id, category_id: categoryId });
  }
  if (snippets.length === 0) return { ok: false, error: 'nessuna riga con titolo' };

  return {
    ok: true,
    world: { name: worldName },
    categories: [
      {
        id: categoryId,
        name: categoryName.trim().slice(0, 80) || 'Importato',
        icon: null,
        color: null,
        fields_schema: fields.map((f) => f.def),
        content_template: null,
      },
    ],
    snippets,
    restrictedFields: [],
    snippetCategories,
    relationTypes: [],
    relations: [],
  };
}
