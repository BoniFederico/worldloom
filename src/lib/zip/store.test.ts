import { describe, expect, it } from 'vitest';
import { buildZip, readZip } from './store';

const text = (s: string) => new TextEncoder().encode(s);

describe('zip (store)', () => {
  it('round trip: scrive e rilegge gli stessi file, nell’ordine', () => {
    const entries = [
      { name: 'a.txt', data: text('ciao') },
      { name: 'cartella/b.md', data: text('# Titolo\n\ncorpo') },
      { name: 'vuoto.txt', data: text('') },
    ];
    const zip = buildZip(entries);
    const read = readZip(zip);
    expect(read).not.toBeNull();
    expect(read?.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    read?.forEach((e, i) => {
      expect(new TextDecoder().decode(e.data)).toBe(new TextDecoder().decode(entries[i]?.data));
    });
  });

  it('rifiuta un buffer che non è un archivio ZIP', () => {
    expect(readZip(text('non è uno zip'))).toBeNull();
    expect(readZip(new Uint8Array())).toBeNull();
  });

  it('produce un file che inizia con la firma di un local file header ZIP', () => {
    const zip = buildZip([{ name: 'x.txt', data: text('x') }]);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
