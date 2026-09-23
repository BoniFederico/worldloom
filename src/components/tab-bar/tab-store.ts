import type { TabKey } from './route-tabs';

export type Tab = { path: string; key: TabKey; label?: string };

const MAX_TABS = 12;

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, Tab[]>();
const EMPTY: Tab[] = [];

function storageKey(worldId: string) {
  return `worldloom:tabs:${worldId}`;
}

function readStored(worldId: string): Tab[] {
  try {
    const raw = localStorage.getItem(storageKey(worldId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tab => typeof t === 'object' && t !== null && typeof t.path === 'string',
    );
  } catch {
    return [];
  }
}

function notify(worldId: string) {
  listeners.get(worldId)?.forEach((l) => l());
}

function set(worldId: string, tabs: Tab[]) {
  cache.set(worldId, tabs);
  try {
    localStorage.setItem(storageKey(worldId), JSON.stringify(tabs));
  } catch {
    // localStorage indisponibile (privata/bloccata): le schede restano solo per questa navigazione.
  }
  notify(worldId);
}

/**
 * Piccolo store esterno a React per la barra di schede (D-052, #112): letto con `useSyncExternalStore`, così le
 * mutazioni (nuova scheda alla navigazione, chiusura, etichetta) non chiamano mai `setState` dentro un effetto.
 */
export function getTabs(worldId: string): Tab[] {
  if (typeof window === 'undefined') return EMPTY;
  if (!cache.has(worldId)) cache.set(worldId, readStored(worldId));
  return cache.get(worldId) as Tab[];
}

export function subscribe(worldId: string, listener: () => void) {
  let set_ = listeners.get(worldId);
  if (!set_) {
    set_ = new Set();
    listeners.set(worldId, set_);
  }
  set_.add(listener);
  return () => set_.delete(listener);
}

export function ensureOpen(worldId: string, path: string, key: TabKey) {
  const tabs = getTabs(worldId);
  if (tabs.some((t) => t.path === path)) return;
  const next = [...tabs, { path, key }];
  set(worldId, next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next);
}

/**
 * Aggiorna l'etichetta della scheda a `path`, creandola se non esiste ancora: gli effetti di `TabLabel` (nella
 * pagina, discendente) e di `TabBarProvider` (nel layout, antenato) possono girare in un ordine qualunque —
 * React esegue prima gli effetti dei discendenti — quindi questa funzione non può assumere che la scheda sia
 * già stata creata da `ensureOpen`.
 */
export function setTabLabel(worldId: string, path: string, key: TabKey, label: string) {
  const tabs = getTabs(worldId);
  const exists = tabs.some((t) => t.path === path);
  const next = exists
    ? tabs.map((t) => (t.path === path ? { ...t, label } : t))
    : [...tabs, { path, key, label }];
  set(worldId, next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next);
}

/** Restituisce la scheda che resterebbe attiva dopo aver chiuso `path` (quella precedente, o la prossima). */
export function closeTab(worldId: string, path: string): Tab | undefined {
  const tabs = getTabs(worldId);
  const index = tabs.findIndex((t) => t.path === path);
  if (index === -1) return undefined;
  const next = tabs.filter((t) => t.path !== path);
  set(worldId, next);
  return next[index - 1] ?? next[0];
}
