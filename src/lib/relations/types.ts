import { uuidSchema } from '@/lib/worlds/schemas';

export type RelationTypeInput = {
  label: string;
  inverse: string | null;
  source: string | null;
  target: string | null;
};

export type RelationTypeResult =
  | { ok: true; value: RelationTypeInput }
  | { ok: false; error: 'invalid_label' | 'invalid_category' };

const MAX_LABEL = 120;
const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

function category(value: string | undefined): string | null | undefined {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = uuidSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Legge un tipo di relazione da un form: etichetta obbligatoria, inversa e categorie facoltative. */
export function parseRelationType(get: (name: string) => string | undefined): RelationTypeResult {
  const label = clean(get('label'));
  const inverse = clean(get('inverse'));
  if (!label || label.length > MAX_LABEL || inverse.length > MAX_LABEL) {
    return { ok: false, error: 'invalid_label' };
  }
  const source = category(get('source'));
  const target = category(get('target'));
  if (source === undefined || target === undefined) return { ok: false, error: 'invalid_category' };
  return { ok: true, value: { label, inverse: inverse || null, source, target } };
}
