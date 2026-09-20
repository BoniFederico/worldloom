export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;
export const MAX_ALIASES = 20;
export const MAX_ALIAS_LENGTH = 100;

export type LabelsResult = { ok: true; values: string[] } | { ok: false };

type Rules = { max: number; maxLength: number; lowercase: boolean };

/**
 * Legge un elenco di etichette da un campo di testo (virgole o a capo). Spazi normalizzati, voci vuote scartate,
 * doppioni (senza badare alle maiuscole) uniti. Troppe voci o voci troppo lunghe sono un errore, non un taglio silenzioso.
 */
function parseLabels(input: string, rules: Rules): LabelsResult {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of input.split(/[,\n\r]+/)) {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (clean.length > rules.maxLength) return { ok: false };
    const value = rules.lowercase ? clean.toLowerCase() : clean;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values.length > rules.max ? { ok: false } : { ok: true, values };
}

/** Tag: sempre minuscoli, così «Magia» e «magia» sono lo stesso tag. */
export const parseTags = (input: string) =>
  parseLabels(input, { max: MAX_TAGS, maxLength: MAX_TAG_LENGTH, lowercase: true });

/** Alias: nomi alternativi, si conserva la grafia. */
export const parseAliases = (input: string) =>
  parseLabels(input, { max: MAX_ALIASES, maxLength: MAX_ALIAS_LENGTH, lowercase: false });
