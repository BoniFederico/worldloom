import { TAB_ICON, type TabKey } from './route-tabs';

export type Tab = { path: string; key: TabKey; label?: string };

const MAX_TABS = 12;
const VALID_KEYS = new Set(Object.keys(TAB_ICON));

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, Tab[]>();
const EMPTY: Tab[] = [];

/**
 * Le schede sono legate all'utente, non solo al mondo (`worldloom:tabs:<userId>:<worldId>`): il progetto ha già
 * un modello di visibilità per utente (GM vs giocatore, `src/lib/visibility/restricted.ts`), e i titoli mostrati
 * in barra (es. il titolo reale di uno snippet riservato) non devono restare leggibili in `localStorage` per un
 * altro utente che apra lo stesso mondo da un browser condiviso.
 */
function scope(userId: string, worldId: string) {
  return `${userId}:${worldId}`;
}

function storageKey(userId: string, worldId: string) {
  return `worldloom:tabs:${scope(userId, worldId)}`;
}

function readStored(userId: string, worldId: string): Tab[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, worldId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tab =>
        typeof t === 'object' &&
        t !== null &&
        typeof t.path === 'string' &&
        typeof t.key === 'string' &&
        VALID_KEYS.has(t.key) &&
        (t.label === undefined || typeof t.label === 'string'),
    );
  } catch {
    return [];
  }
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function set(userId: string, worldId: string, tabs: Tab[]) {
  const key = scope(userId, worldId);
  cache.set(key, tabs);
  try {
    localStorage.setItem(storageKey(userId, worldId), JSON.stringify(tabs));
  } catch {
    // localStorage indisponibile (privata/bloccata): le schede restano solo per questa navigazione.
  }
  notify(key);
}

/**
 * Piccolo store esterno a React per la barra di schede (D-052, #112): letto con `useSyncExternalStore`, così le
 * mutazioni (nuova scheda alla navigazione, chiusura, etichetta) non chiamano mai `setState` dentro un effetto.
 */
export function getTabs(userId: string, worldId: string): Tab[] {
  if (typeof window === 'undefined') return EMPTY;
  const key = scope(userId, worldId);
  if (!cache.has(key)) cache.set(key, readStored(userId, worldId));
  return cache.get(key) as Tab[];
}

export function subscribe(userId: string, worldId: string, listener: () => void) {
  const key = scope(userId, worldId);
  let set_ = listeners.get(key);
  if (!set_) {
    set_ = new Set();
    listeners.set(key, set_);
  }
  set_.add(listener);
  return () => {
    set_.delete(listener);
    if (set_.size === 0) listeners.delete(key);
  };
}

export function ensureOpen(userId: string, worldId: string, path: string, key: TabKey) {
  const tabs = getTabs(userId, worldId);
  if (tabs.some((t) => t.path === path)) return;
  const next = [...tabs, { path, key }];
  set(userId, worldId, next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next);
}

/**
 * Aggiorna l'etichetta della scheda a `path`, creandola se non esiste ancora: gli effetti di `TabLabel` (nella
 * pagina, discendente) e di `TabBarProvider` (nel layout, antenato) possono girare in un ordine qualunque —
 * React esegue prima gli effetti dei discendenti — quindi questa funzione non può assumere che la scheda sia
 * già stata creata da `ensureOpen`.
 */
export function setTabLabel(
  userId: string,
  worldId: string,
  path: string,
  key: TabKey,
  label: string,
) {
  const tabs = getTabs(userId, worldId);
  const exists = tabs.some((t) => t.path === path);
  const next = exists
    ? tabs.map((t) => (t.path === path ? { ...t, label } : t))
    : [...tabs, { path, key, label }];
  set(userId, worldId, next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next);
}

/** Restituisce la scheda che resterebbe attiva dopo aver chiuso `path` (quella precedente, o la prossima). */
export function closeTab(userId: string, worldId: string, path: string): Tab | undefined {
  const tabs = getTabs(userId, worldId);
  const index = tabs.findIndex((t) => t.path === path);
  if (index === -1) return undefined;
  const next = tabs.filter((t) => t.path !== path);
  set(userId, worldId, next);
  return next[index - 1] ?? next[0];
}
