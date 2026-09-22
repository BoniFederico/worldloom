import { z } from 'zod';

// Solo metadati opachi (mai il messaggio dell'errore, che potrebbe incorporare input dell'utente).
export const clientErrorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  digest: z.string().trim().max(80).optional(),
  path: z.string().trim().min(1).max(200),
});
