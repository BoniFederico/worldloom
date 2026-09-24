'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { tabKeyFor } from './route-tabs';
import { closeTab, ensureOpen, getTabs, setTabLabel, subscribe, type Tab } from './tab-store';

type Ctx = {
  tabs: Tab[];
  activePath: string;
  worldId: string;
  userId: string;
  close: (path: string) => void;
};

const TabBarContext = createContext<Ctx | null>(null);

/**
 * Barra di schede persistente per mondo e per utente (D-052, D-055, #112): le schede aperte vivono in un piccolo
 * store esterno a React (`tab-store.ts`, `localStorage` per dispositivo e utente), letto con `useSyncExternalStore`
 * — mai `setState` dentro un effetto. Solo lato client: nessuna relazione con lo streaming delle route (D-054).
 * `userId` arriva dal layout server (stesso pattern di `AppHeader`) per non mescolare le schede, e i titoli che
 * possono contenere, fra utenti diversi dello stesso browser (D-055).
 */
export function TabBarProvider({
  worldId,
  userId,
  children,
}: {
  worldId: string;
  userId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/worlds/${worldId}`;
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : '';

  const tabs = useSyncExternalStore(
    useCallback((listener) => subscribe(userId, worldId, listener), [userId, worldId]),
    useCallback(() => getTabs(userId, worldId), [userId, worldId]),
    () => [] as Tab[],
  );

  useEffect(() => {
    if (!userId) return;
    const key = tabKeyFor(relative);
    if (key) ensureOpen(userId, worldId, pathname, key);
  }, [pathname, relative, userId, worldId]);

  const close = useCallback(
    (path: string) => {
      const fallback = closeTab(userId, worldId, path);
      if (path === pathname) router.push(fallback ? fallback.path : base);
    },
    [userId, worldId, pathname, router, base],
  );

  const value = useMemo(
    () => ({ tabs, activePath: pathname, worldId, userId, close }),
    [tabs, pathname, worldId, userId, close],
  );

  return <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>;
}

export function useTabBar() {
  return useContext(TabBarContext);
}

/** Da usare in una pagina (es. dettaglio snippet) per dare alla sua scheda un'etichetta migliore di quella generica. */
export function useRegisterTabLabel(label: string) {
  const pathname = usePathname();
  const ctx = useContext(TabBarContext);
  const worldId = ctx?.worldId;
  const userId = ctx?.userId;
  useEffect(() => {
    if (!worldId || !userId || !label) return;
    const base = `/worlds/${worldId}`;
    const relative = pathname.startsWith(base) ? pathname.slice(base.length) : '';
    const key = tabKeyFor(relative);
    if (key) setTabLabel(userId, worldId, pathname, key, label);
  }, [worldId, userId, pathname, label]);
}
