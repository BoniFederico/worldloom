import { uuidSchema } from '@/lib/worlds/schemas';

export const LEVELS = ['secret', 'shared', 'members', 'public'] as const;
export type Level = (typeof LEVELS)[number];
/** Un campo non è mai più visibile dello snippet che lo contiene: «members» è il suo livello di base. */
export const FIELD_LEVELS = ['secret', 'shared', 'members'] as const;
export type FieldLevel = (typeof FIELD_LEVELS)[number];

export const MAX_SHARED_USERS = 100;
export const MAX_NOTE = 500;

const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);

export type VisibilityInput = {
  level: Level;
  /** Destinatari (solo per «shared»): membri del mondo scelti dal DM. */
  users: string[];
  /** Livello per campo, solo per le chiavi ammesse. */
  fields: Record<string, FieldLevel>;
  /** Destinatari di ogni campo impostato su «shared»: propri, mai quelli dello snippet o di un altro campo. */
  fieldUsers: Record<string, string[]>;
  note: string;
  session: string | null;
};

/**
 * Modulo di visibilità di uno snippet (o, senza `allowedFields`, di una relazione o di un pin). Ogni valore viene
 * normalizzato: livelli fuori elenco, utenti non validi o doppi e chiavi di campo inventate fanno rifiutare il modulo.
 */
export function parseVisibilityForm(
  get: (name: string) => string | null | undefined,
  getAll: (name: string) => string[],
  allowedFields: string[] = [],
): { ok: true; value: VisibilityInput } | { ok: false } {
  const level = get('level');
  if (!isLevel(level)) return { ok: false };

  const usersOf = (name: string): string[] | null => {
    const list = [
      ...new Set(
        getAll(name)
          .map((u) => u.trim())
          .filter(Boolean),
      ),
    ];
    return list.length > MAX_SHARED_USERS || list.some((u) => !uuidSchema.safeParse(u).success)
      ? null
      : list;
  };
  const users = usersOf('users');
  if (!users) return { ok: false };

  const fields: Record<string, FieldLevel> = {};
  const fieldUsers: Record<string, string[]> = {};
  for (const key of allowedFields) {
    if (!FIELD_KEY.test(key)) continue;
    const raw = get(`field:${key}`);
    if (raw === null || raw === undefined || raw === '') continue;
    if (!FIELD_LEVELS.includes(raw as FieldLevel)) return { ok: false };
    fields[key] = raw as FieldLevel;
    if (raw === 'shared') {
      const list = usersOf(`users:${key}`);
      if (!list || list.length === 0) return { ok: false };
      fieldUsers[key] = list;
    }
  }

  const note = (get('note') ?? '').replace(/\r\n?/g, '\n').trim();
  if (note.length > MAX_NOTE) return { ok: false };
  const rawSession = (get('session') ?? '').trim();
  if (rawSession && !uuidSchema.safeParse(rawSession).success) return { ok: false };

  if (level === 'shared' && users.length === 0) return { ok: false };

  return {
    ok: true,
    value: {
      level,
      users: level === 'shared' ? users : [],
      fields,
      fieldUsers,
      note,
      session: rawSession || null,
    },
  };
}

/** Livello mostrato di un campo: quello del valore riservato, altrimenti «members». */
export const fieldLevelOf = (restricted: Record<string, FieldLevel>, key: string): FieldLevel =>
  restricted[key] ?? 'members';
