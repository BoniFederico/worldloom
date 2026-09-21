import { z } from 'zod';
import { uuidSchema } from '@/lib/worlds/schemas';

export const KINDS = ['pc', 'npc'] as const;
export type Kind = (typeof KINDS)[number];

export const characterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS),
  /** Solo per i PG: il giocatore a cui appartiene (vuoto = nessuno). */
  owner: z.union([uuidSchema, z.literal('')]).transform((v) => (v === '' ? null : v)),
  notes: z.string().max(20_000),
});

/** Un PNG non ha proprietario. */
export const ownerFor = (kind: Kind, owner: string | null) => (kind === 'pc' ? owner : null);

/** Un giocatore crea e modifica solo un PG per sé: il tipo e il proprietario non vengono dal modulo. */
export function characterInput(
  raw: { name: string; kind: string; owner: string; notes: string },
  canManage: boolean,
  userId: string,
) {
  const parsed = characterSchema.safeParse(canManage ? raw : { ...raw, kind: 'pc', owner: userId });
  if (!parsed.success) return null;
  const { name, kind, notes } = parsed.data;
  return { name, kind, owner: ownerFor(kind, parsed.data.owner), notes };
}
