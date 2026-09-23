import { fileNameOf } from './filename';
import { docToMarkdown } from '@/lib/markdown/render';
import type { DocNode } from '@/lib/snippets/body';
import type { ZipEntry } from '@/lib/zip/store';
import { buildExport, type RawWorld, type WorldExport } from './world';

/**
 * Esportazione del mondo in Markdown (#100, completa il MUST rimandato da D-021/D-043): un archivio ZIP con
 * un file .md per snippet (front matter + corpo leggibile) più `_worldloom.json`, lo stesso export JSON di
 * D-021. La fedeltà del round trip (SPEC: «l'export deve ricreare il mondo identico») viene da quel file, già
 * testato; i .md sono una rappresentazione leggibile, pensata anche per essere aperta in Obsidian — reimportarli
 * uno per uno passa comunque dal percorso di import Markdown già esistente (best-effort, D-043), non da questo.
 */
const yamlScalar = (value: string): string =>
  /[:#\n]|^\s|\s$|^$/.test(value) ? JSON.stringify(value) : value;
const yamlList = (values: string[]): string => `[${values.map(yamlScalar).join(', ')}]`;

function frontMatter(snippet: WorldExport['snippets'][number], categoryNames: string[]): string {
  const lines = [
    `title: ${yamlScalar(snippet.title)}`,
    `status: ${snippet.status}`,
    `visibility: ${snippet.visibility}`,
    `archived: ${snippet.archived}`,
  ];
  if (categoryNames.length) lines.push(`categories: ${yamlList(categoryNames)}`);
  if (snippet.tags.length) lines.push(`tags: ${yamlList(snippet.tags)}`);
  if (snippet.aliases.length) lines.push(`aliases: ${yamlList(snippet.aliases)}`);
  lines.push(`createdAt: ${snippet.createdAt}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** Nome file univoco dal titolo: slug più suffisso numerico progressivo in caso di doppioni. */
function uniqueFileNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title) => {
    const base = fileNameOf(title);
    let name = base;
    let n = 1;
    while (used.has(name)) name = `${base}-${++n}`;
    used.add(name);
    return `${name}.md`;
  });
}

export function buildMarkdownBundle(raw: RawWorld): ZipEntry[] {
  const data = buildExport(raw);
  const enc = new TextEncoder();
  const titleByRef = new Map(data.snippets.map((s) => [s.ref, s.title]));
  const nameByCategoryRef = new Map(data.categories.map((c) => [c.ref, c.name]));
  const fileNames = uniqueFileNames(data.snippets.map((s) => s.title));

  const entries: ZipEntry[] = [
    { name: '_worldloom.json', data: enc.encode(JSON.stringify(data, null, 2)) },
  ];
  data.snippets.forEach((snippet, i) => {
    const categoryNames = snippet.categories.flatMap((ref) => nameByCategoryRef.get(ref) ?? []);
    const body = docToMarkdown(snippet.body as DocNode, (ref) => titleByRef.get(ref) ?? null);
    const content = frontMatter(snippet, categoryNames) + (body ? `\n${body}\n` : '');
    entries.push({ name: fileNames[i] as string, data: enc.encode(content) });
  });
  return entries;
}
