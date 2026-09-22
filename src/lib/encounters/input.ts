import { z } from 'zod';

export const encounterNameSchema = z.string().trim().max(120);
export const participantNameSchema = z.string().trim().min(1).max(120);
export const resourceLabelSchema = z.string().trim().max(40);

/** Iniziativa: un numero finito qualunque (anche negativo o non intero, per formule d'iniziativa insolite). */
export const isValidInitiative = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1_000_000;

/** Punti ferita: un intero non negativo, o `null` se il campo è vuoto (nessun valore tracciato). */
export function parseHp(raw: string): { ok: true; value: number | null } | { ok: false } {
  if (raw.trim() === '') return { ok: true, value: null };
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? { ok: true, value: n } : { ok: false };
}
