export type MentionCandidate = { id: string; title: string; aliases: string[] };
export type MentionSuggestion = { id: string; title: string; alias?: string };

/** Minuscole e senza accenti: «Élara» e «elara» si equivalgono. */
export const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Suggerimenti per `@query`: titoli e alias che contengono il testo, prima quelli che iniziano con esso, poi in
 * ordine alfabetico. Se corrisponde solo un alias lo si indica (`alias`). Senza testo si offrono i primi.
 */
export function suggestMentions(
  candidates: MentionCandidate[],
  query: string,
  limit = 8,
): MentionSuggestion[] {
  const q = fold(query.trim());
  const scored: { suggestion: MentionSuggestion; rank: number }[] = [];
  for (const c of candidates) {
    const title = fold(c.title);
    if (!q) {
      scored.push({ suggestion: { id: c.id, title: c.title }, rank: 2 });
      continue;
    }
    if (title.startsWith(q)) scored.push({ suggestion: { id: c.id, title: c.title }, rank: 0 });
    else if (title.includes(q)) scored.push({ suggestion: { id: c.id, title: c.title }, rank: 1 });
    else {
      const alias =
        c.aliases.find((a) => fold(a).startsWith(q)) ?? c.aliases.find((a) => fold(a).includes(q));
      if (alias) scored.push({ suggestion: { id: c.id, title: c.title, alias }, rank: 1 });
    }
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.suggestion.title.localeCompare(b.suggestion.title))
    .slice(0, limit)
    .map((s) => s.suggestion);
}
