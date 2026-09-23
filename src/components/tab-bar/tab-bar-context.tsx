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
  close: (path: string) => void;
};

const TabBarContext = createContext<Ctx | null>(null);

/**
 * Barra di schede persistente per mondo (D-052, #112): le schede aperte vivono in un piccolo store esterno a
 * React (`tab-store.ts`, `localStorage` per dispositivo), letto con `useSyncExternalStore` — mai `setState`
 * dentro un effetto. Solo lato client: nessuna relazione con lo streaming delle route (D-054).
 */
export function TabBarProvider({ worldId, children }: { worldId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/worlds/${worldId}`;
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : '';

  const tabs = useSyncExternalStore(
    useCallback((listener) => subscribe(worldId, listener), [worldId]),
    useCallback(() => getTabs(worldId), [worldId]),
    () => [] as Tab[],
  );

  useEffect(() => {
    const key = tabKeyFor(relative);
    if (key) ensureOpen(worldId, pathname, key);
  }, [pathname, relative, worldId]);

  const close = useCallback(
    (path: string) => {
      const fallback = closeTab(worldId, path);
      if (path === pathname) router.push(fallback ? fallback.path : base);
    },
    [worldId, pathname, router, base],
  );

  const value = useMemo(
    () => ({ tabs, activePath: pathname, worldId, close }),
    [tabs, pathname, worldId, close],
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
  useEffect(() => {
    if (!worldId || !label) return;
    const base = `/worlds/${worldId}`;
    const relative = pathname.startsWith(base) ? pathname.slice(base.length) : '';
    const key = tabKeyFor(relative);
    if (key) setTabLabel(worldId, pathname, key, label);
  }, [worldId, pathname, label]);
}
