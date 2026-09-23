import { describe, expect, it } from 'vitest';
import { tabKeyFor } from './route-tabs';

describe('tabKeyFor', () => {
  it('riconosce la radice del mondo come dashboard', () => {
    expect(tabKeyFor('')).toBe('dashboard');
    expect(tabKeyFor('/')).toBe('dashboard');
  });

  it('distingue elenco, dettaglio e cronologia di uno snippet', () => {
    expect(tabKeyFor('/snippets')).toBe('snippets');
    expect(tabKeyFor('/snippets/abc-123')).toBe('snippetDetail');
    expect(tabKeyFor('/snippets/abc-123/history')).toBe('snippetHistory');
  });

  it('riconosce le viste principali', () => {
    expect(tabKeyFor('/table')).toBe('table');
    expect(tabKeyFor('/graph')).toBe('graph');
    expect(tabKeyFor('/timeline')).toBe('timeline');
    expect(tabKeyFor('/kanban')).toBe('kanban');
    expect(tabKeyFor('/tree')).toBe('tree');
    expect(tabKeyFor('/maps')).toBe('maps');
    expect(tabKeyFor('/views')).toBe('views');
  });

  it('restituisce null per un percorso non riconosciuto, invece di una scheda sbagliata', () => {
    expect(tabKeyFor('/export')).toBeNull();
    expect(tabKeyFor('/qualcosa-di-ignoto')).toBeNull();
  });
});
