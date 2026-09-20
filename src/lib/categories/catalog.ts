import { z } from 'zod';

/** Colori di categoria: nomi che il CSS traduce in token per tema chiaro e scuro (`--cat-*`). */
export const CATEGORY_COLORS = [
  'teal',
  'brass',
  'moss',
  'rust',
  'slate',
  'plum',
  'ocean',
  'rose',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Icone Lucide selezionabili (chiavi kebab-case, mappate in `category-icon.tsx`). */
export const CATEGORY_ICONS = [
  'user',
  'map-pin',
  'calendar-days',
  'book-open',
  'gem',
  'flag',
  'scroll-text',
  'swords',
  'crown',
  'castle',
  'mountain',
  'trees',
  'feather',
  'sparkles',
  'landmark',
  'compass',
  'skull',
  'flame',
  'key-round',
  'shield',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.enum(CATEGORY_ICONS),
  color: z.enum(CATEGORY_COLORS),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
