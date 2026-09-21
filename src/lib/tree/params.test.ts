import { describe, expect, it } from 'vitest';
import { DEFAULT_TREE, parseTreeConfig, parseTreeParams, treeQuery } from './params';

describe('parseTreeParams', () => {
  it('senza parametri dà i predefiniti; normalizza spazi e lunghezze', () => {
    expect(parseTreeParams({})).toEqual(DEFAULT_TREE);
    expect(parseTreeParams({ label: '  padre   di ', dir: 'up', root: ' Elara  Venti ' })).toEqual({
      label: 'padre di',
      dir: 'up',
      root: 'Elara Venti',
    });
    expect(parseTreeParams({ label: 'a'.repeat(500) }).label).toHaveLength(120);
    expect(parseTreeParams({ dir: 'boh' }).dir).toBe('down');
    expect(parseTreeParams({ label: ['x', 'y'] }).label).toBe('x');
  });
});

describe('treeQuery', () => {
  it('scrive solo il non predefinito e si rilegge uguale', () => {
    expect(treeQuery(DEFAULT_TREE)).toBe('');
    const p = parseTreeParams({ label: 'padre di', dir: 'up', root: 'Elara' });
    const qs = treeQuery(p);
    expect(qs).toBe('label=padre+di&dir=up&root=Elara');
    expect(parseTreeParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual(p);
  });
});

describe('parseTreeConfig', () => {
  it('accetta la configurazione salvata con gli stessi limiti', () => {
    expect(parseTreeConfig({ label: 'padre di', dir: 'up', root: 'X' })).toEqual({
      label: 'padre di',
      dir: 'up',
      root: 'X',
    });
    expect(parseTreeConfig(null)).toEqual(DEFAULT_TREE);
    expect(parseTreeConfig({ label: 5, dir: {}, root: [] })).toEqual(DEFAULT_TREE);
  });
});
