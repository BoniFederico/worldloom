import { z } from 'zod';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Testo -> minuscolo, ASCII, trattini singoli; usato sia per lo slug del mondo sia per il percorso di uno snippet. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

// Allineato al vincolo `check` di worlds.wiki_slug.
export const wikiSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .min(3)
  .max(60);

/** Percorso leggibile di uno snippet nella wiki: `<titolo-slug>-<id>` (o solo l'id se il titolo non produce testo). */
export function snippetPath({ id, title }: { id: string; title: string }): string {
  const prefix = slugify(title);
  return prefix ? `${prefix}-${id}` : id;
}

/** L'id è sempre l'ultimo segmento in formato UUID: il prefisso leggibile è solo cosmetico, non serve al lookup. */
export function wikiSnippetIdFromPath(path: string): string | null {
  const match = path.match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}
