import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTab, ensureOpen, getTabs, setTabLabel } from './tab-store';

/**
 * Il modulo non ha una dipendenza da jsdom (assente dal progetto): stub minimo di `window`/`localStorage`,
 * sufficiente per queste funzioni pure. Un `worldId` diverso per test evita che la cache in memoria del modulo
 * (persistente per l'intero file, letta da `localStorage` solo alla prima chiamata per chiave) faccia trapelare
 * stato fra un test e l'altro.
 */
let backing: Map<string, string>;
let worldCounter = 0;

beforeEach(() => {
  backing = new Map();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
    clear: () => backing.clear(),
  });
});

const USER = 'user-1';
const nextWorld = () => `world-${worldCounter++}`;

describe('tab-store', () => {
  it('separa le schede per utente, anche sullo stesso mondo', () => {
    const world = nextWorld();
    ensureOpen(USER, world, `/worlds/${world}/snippets/abc`, 'snippetDetail');
    setTabLabel(USER, world, `/worlds/${world}/snippets/abc`, 'snippetDetail', 'Segreto del GM');

    expect(getTabs('user-2', world)).toEqual([]);
    expect(getTabs(USER, world)[0]?.label).toBe('Segreto del GM');
  });

  it('scarta dal localStorage le voci con una chiave sconosciuta invece di far crollare il render', () => {
    const world = nextWorld();
    backing.set(
      `worldloom:tabs:${USER}:${world}`,
      JSON.stringify([
        { path: `/worlds/${world}`, key: 'dashboard' },
        { path: `/worlds/${world}/x`, key: 'chiave-inesistente' },
      ]),
    );
    expect(getTabs(USER, world)).toEqual([{ path: `/worlds/${world}`, key: 'dashboard' }]);
  });

  it('chiudendo la prima scheda fra più resta attiva quella che diventa la prima', () => {
    const world = nextWorld();
    ensureOpen(USER, world, '/a', 'dashboard');
    ensureOpen(USER, world, '/b', 'table');
    ensureOpen(USER, world, '/c', 'graph');
    const fallback = closeTab(USER, world, '/a');
    expect(fallback?.path).toBe('/b');
    expect(getTabs(USER, world).map((t) => t.path)).toEqual(['/b', '/c']);
  });

  it('chiudendo l’unica scheda aperta non resta nulla', () => {
    const world = nextWorld();
    ensureOpen(USER, world, '/a', 'dashboard');
    const fallback = closeTab(USER, world, '/a');
    expect(fallback).toBeUndefined();
    expect(getTabs(USER, world)).toEqual([]);
  });

  it('chiudere un percorso non aperto non fa nulla', () => {
    const world = nextWorld();
    ensureOpen(USER, world, '/a', 'dashboard');
    expect(closeTab(USER, world, '/mai-aperto')).toBeUndefined();
    expect(getTabs(USER, world)).toHaveLength(1);
  });

  it('oltre 12 schede aperte, scarta le più vecchie mantenendo l’ultima', () => {
    const world = nextWorld();
    for (let i = 0; i < 15; i++) ensureOpen(USER, world, `/tab-${i}`, 'dashboard');
    const tabs = getTabs(USER, world);
    expect(tabs).toHaveLength(12);
    expect(tabs[0]?.path).toBe('/tab-3');
    expect(tabs.at(-1)?.path).toBe('/tab-14');
  });

  it('setTabLabel oltre 12 schede scarta comunque le più vecchie', () => {
    const world = nextWorld();
    for (let i = 0; i < 12; i++) ensureOpen(USER, world, `/tab-${i}`, 'dashboard');
    setTabLabel(USER, world, '/nuova', 'snippetDetail', 'Titolo');
    const tabs = getTabs(USER, world);
    expect(tabs).toHaveLength(12);
    expect(tabs.at(-1)).toEqual({ path: '/nuova', key: 'snippetDetail', label: 'Titolo' });
    expect(tabs.some((t) => t.path === '/tab-0')).toBe(false);
  });
});
