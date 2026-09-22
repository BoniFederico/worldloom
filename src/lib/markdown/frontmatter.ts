/**
 * Front matter YAML "lite": solo ciò che serve per leggere le note esportate da Obsidian o scritte a mano
 * (`chiave: valore`, liste `[a, b]` o a righe con `- `). Non è un parser YAML completo: un valore che non
 * rientra in questi casi resta una stringa così com'è.
 */
export type FrontMatter = Record<string, string | string[]>;

function parseScalar(raw: string): string {
  const value = raw.trim();
  const quoted = value.match(/^(['"])(.*)\1$/);
  return quoted?.[2] ?? value;
}

function parseInlineList(raw: string): string[] {
  const inner = raw.trim().slice(1, -1);
  return inner
    .split(',')
    .map((v) => parseScalar(v))
    .filter((v) => v !== '');
}

/** Divide il testo in front matter (se presente, delimitato da `---`) e corpo. */
export function parseFrontMatter(text: string): { data: FrontMatter; body: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n') && normalized !== '---')
    return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: normalized };
  const block = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, '');

  const data: FrontMatter = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const key = match[1] ?? '';
    const rest = match[2] ?? '';
    if (!key) continue;
    if (rest.startsWith('[') && rest.endsWith(']')) {
      data[key] = parseInlineList(rest);
      continue;
    }
    if (rest === '') {
      // Possibile lista a righe `  - voce` subito sotto.
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s*(.*)$/.test(lines[i + 1] ?? '')) {
        i++;
        const item = (lines[i] ?? '').match(/^\s+-\s*(.*)$/);
        if (item?.[1] !== undefined) items.push(parseScalar(item[1]));
      }
      data[key] = items.length ? items : '';
      continue;
    }
    data[key] = parseScalar(rest);
  }
  return { data, body };
}

/** Legge un campo come lista, accettando sia un array sia una stringa separata da virgole. */
export function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string')
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}
