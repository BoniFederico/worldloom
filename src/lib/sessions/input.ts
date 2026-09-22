import { z } from 'zod';

/** Modulo di una sessione: titolo e data facoltativi, riepilogo entro il limite del database. */
export const sessionSchema = z.object({
  title: z.string().trim().max(150),
  playedOn: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')])
    .transform((v) => v || null),
  summary: z.string().max(10000),
});

/** Note (DM o giocatore): stesso limite del database. */
export const notesSchema = z.string().max(10000);

export const MESSAGE_MAX = 5000;

/** Un messaggio o una voce di diario: non vuoto (dopo il trim) e non troppo lungo. */
export const postSchema = z.string().trim().min(1).max(MESSAGE_MAX);

export type PostKind = 'chronicle' | 'message';
