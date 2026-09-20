export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;
export const MAX_ALIASES = 20;
export const MAX_ALIAS_LENGTH = 100;

export type LabelsResult = { ok: true; values: string[] } | { ok: false };

type Rules = {
  max: number;
  maxLength: number;
  lowercase: boolean;
  separator: RegExp;
  /** Caratteri vietati: hanno un significato nei filtri (virgola, graffe, doppi apici, backslash). */
  forbidden?: RegExp;
};

/**
 * Legge un elenco di etichette da un campo di testo. Spazi normalizzati, voci vuote scartate, doppioni (senza badare
 * alle maiuscole) uniti. Troppe voci, voci troppo lunghe o con caratteri vietati sono un errore, non un taglio silenzioso.
 */
function parseLabels(input: string, rules: Rules): LabelsResult {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of input.split(rules.separator)) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (clean.length > rules.maxLength || rules.forbidden?.test(clean)) return { ok: false };
    const value = rules.lowercase ? clean.toLowerCase() : clean;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values.length > rules.max ? { ok: false } : { ok: true, values };
}

/** Tag: separati da virgola o a capo, sempre minuscoli («Magia» e «magia» sono lo stesso tag). */
export const parseTags = (input: string) =>
  parseLabels(input, {
    max: MAX_TAGS,
    maxLength: MAX_TAG_LENGTH,
    lowercase: true,
    separator: /[,\n\r]+/,
    forbidden: /[{}"\\]/,
  });

/** Alias: nomi alternativi, uno per riga (la virgola fa parte del nome: «Smith, John»); si conserva la grafia. */
export const parseAliases = (input: string) =>
  parseLabels(input, {
    max: MAX_ALIASES,
    maxLength: MAX_ALIAS_LENGTH,
    lowercase: false,
    separator: /[\n\r]+/,
  });
