/** Ordina i partecipanti per iniziativa decrescente; a parità, chi è stato aggiunto prima resta prima (ordine stabile). */
export function orderByInitiative<T extends { initiative: number; created_at: string }>(
  participants: readonly T[],
): T[] {
  return [...participants].sort(
    (a, b) => b.initiative - a.initiative || a.created_at.localeCompare(b.created_at),
  );
}

/** Turno e round dopo "avanti": si torna al primo e si passa al round successivo dopo l'ultimo partecipante. */
export function advanceTurn(
  count: number,
  round: number,
  turnIndex: number,
): { round: number; turnIndex: number } {
  if (count <= 0) return { round, turnIndex: 0 };
  const next = (turnIndex + 1) % count;
  return { round: next === 0 ? round + 1 : round, turnIndex: next };
}

/** Indice valido nell'ordine attuale: se qualcuno è stato rimosso, il turno salvato può eccedere il conteggio. */
export function currentTurnIndex(count: number, turnIndex: number): number {
  return count > 0 ? turnIndex % count : 0;
}
