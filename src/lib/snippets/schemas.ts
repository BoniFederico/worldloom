import { z } from 'zod';

/** Titolo dello snippet: come il vincolo del database (1–300 caratteri dopo il trim). */
export const snippetTitleSchema = z.string().trim().min(1).max(300);
