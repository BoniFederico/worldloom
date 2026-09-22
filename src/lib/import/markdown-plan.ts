import type { ImportPlan } from '@/lib/export/world';
import { asList, parseFrontMatter } from '@/lib/markdown/frontmatter';
import { markdownToDoc } from '@/lib/markdown/doc';
import { MAX_ALIASES, MAX_ALIAS_LENGTH, MAX_TAGS, MAX_TAG_LENGTH } from '@/lib/snippets/labels';
import { mentionsOf, validateBody } from '@/lib/snippets/body';

export const MAX_MARKDOWN_FILES = 2000;
// Ogni file è già limitato a 200 menzioni da `validateBody` (MAX_MENTIONS), ma niente limita il totale tra più
// file: senza un tetto qui, `importWorld` potrebbe dover scrivere molte più righe di quante l'import JSON ne
// ammetta (MAX_RELATIONS in src/lib/export/world.ts), rischiando un'importazione lunga e a metà se si interrompe.
export const MAX_MARKDOWN_RELATIONS = 5000;

/**
 * Piano di importazione da file Markdown (uno snippet per file), compatibile con Obsidian: front matter
 * riconosciuto (`title`, `tags`, `aliases`, `status`), wikilink `[[Titolo]]`/`[[Titolo|alias]]` risolti in
 * menzioni tra i file dello stesso import (per titolo, senza badare a maiuscole; il primo che corrisponde vince).
 * Nessuna categoria: Obsidian non ne ha un concetto diretto (limite noto, vedi D-043).
 */
export function planMarkdownImport(
  worldName: string,
  files: { name: string; content: string }[],
  newId: () => string,
): ImportPlan {
  if (files.length === 0 || files.length > MAX_MARKDOWN_FILES) {
    return { ok: false, error: 'nessun file valido' };
  }

  const parsed = files.map((f) => {
    const { data, body } = parseFrontMatter(f.content);
    const title =
      (typeof data.title === 'string' && data.title.trim()) ||
      f.name.replace(/\.(md|markdown|txt)$/i, '').trim() ||
      'Senza titolo';
    return { id: newId(), title: title.slice(0, 300), data, body };
  });

  const byTitle = new Map<string, string>();
  for (const p of parsed)
    if (!byTitle.has(p.title.toLowerCase())) byTitle.set(p.title.toLowerCase(), p.id);

  const now = new Date().toISOString();
  const snippets: Extract<ImportPlan, { ok: true }>['snippets'] = [];
  const relations: Extract<ImportPlan, { ok: true }>['relations'] = [];
  for (const p of parsed) {
    // Un wikilink verso se stessi non diventa una menzione (D-018: «si ignorano se stessi»).
    const resolve = (title: string) => {
      const id = byTitle.get(title.trim().toLowerCase());
      return id && id !== p.id ? id : null;
    };
    const raw = markdownToDoc(p.body, resolve);
    const body = validateBody(raw);
    if (!body) return { ok: false, error: `${p.title}: testo non valido` };
    const status = p.data.status === 'final' ? 'final' : 'draft';
    snippets.push({
      id: p.id,
      title: p.title,
      status,
      visibility: 'members',
      archived_at: null,
      tags: asList(p.data.tags)
        .slice(0, MAX_TAGS)
        .map((t) => t.slice(0, MAX_TAG_LENGTH)),
      aliases: asList(p.data.aliases)
        .slice(0, MAX_ALIASES)
        .map((a) => a.slice(0, MAX_ALIAS_LENGTH)),
      fields: {},
      body,
      created_at: now,
    });
    // Un wikilink risolto diventa una menzione nel testo; qui si crea esplicitamente la relazione che la
    // rappresenta (D-018: «menziona»/«menzionato in», `from_mention: true`), perché l'importazione scrive le
    // righe direttamente e non passa dalla funzione `save_snippet` che di norma la sincronizza.
    for (const targetId of mentionsOf(body)) {
      if (relations.length >= MAX_MARKDOWN_RELATIONS)
        return { ok: false, error: 'troppi wikilink' };
      relations.push({
        source_id: p.id,
        target_id: targetId,
        label: 'menziona',
        inverse_label: 'menzionato in',
        notes: '',
        valid_from: null,
        valid_to: null,
        from_mention: true,
        visibility: 'members',
        created_at: now,
      });
    }
  }

  return {
    ok: true,
    world: { name: worldName },
    categories: [],
    snippets,
    restrictedFields: [],
    snippetCategories: [],
    relationTypes: [],
    relations,
  };
}
