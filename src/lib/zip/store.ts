import { crc32 } from './crc32';

/**
 * ZIP minimo, solo metodo STORE (nessuna compressione): formato binario semplice e ben specificato, non
 * giustifica una dipendenza (stesso criterio di D-033/D-043 per altri formati hand-rolled). Copre ciò che
 * serve qui — un archivio leggibile da qualunque strumento ZIP standard — non l'intera specifica (niente
 * Zip64, niente cifratura, niente compressione).
 */
export type ZipEntry = { name: string; data: Uint8Array };

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

function dosDateTime(): { time: number; date: number } {
  // Data/ora fissa (non influisce sul contenuto): evita che due export dello stesso mondo differiscano solo per l'orologio.
  return { time: 0, date: (1 << 5) | 1 };
}

class Writer {
  private chunks: Uint8Array[] = [];
  u8(v: number) {
    this.chunks.push(Uint8Array.of(v & 0xff));
  }
  u16(v: number) {
    this.chunks.push(Uint8Array.of(v & 0xff, (v >>> 8) & 0xff));
  }
  u32(v: number) {
    this.chunks.push(
      Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff),
    );
  }
  bytes(b: Uint8Array) {
    this.chunks.push(b);
  }
  get length(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0);
  }
  build(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

/** Costruisce un archivio ZIP (solo STORE) dagli ingressi dati, nell'ordine passato. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const { time, date } = dosDateTime();
  const enc = new TextEncoder();
  const w = new Writer();
  const offsets: number[] = [];

  for (const entry of entries) {
    offsets.push(w.length);
    const name = enc.encode(entry.name);
    const crc = crc32(entry.data);
    w.u32(LOCAL_SIG);
    w.u16(20); // versione minima
    w.u16(0); // flag
    w.u16(0); // metodo: 0 = store
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(entry.data.length); // compresso = non compresso
    w.u32(entry.data.length);
    w.u16(name.length);
    w.u16(0); // extra
    w.bytes(name);
    w.bytes(entry.data);
  }

  const centralStart = w.length;
  entries.forEach((entry, i) => {
    const name = enc.encode(entry.name);
    const crc = crc32(entry.data);
    w.u32(CENTRAL_SIG);
    w.u16(20); // versione che ha creato
    w.u16(20); // versione minima
    w.u16(0);
    w.u16(0);
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(entry.data.length);
    w.u32(entry.data.length);
    w.u16(name.length);
    w.u16(0); // extra
    w.u16(0); // commento
    w.u16(0); // disco iniziale
    w.u16(0); // attributi interni
    w.u32(0); // attributi esterni
    w.u32(offsets[i] as number);
    w.bytes(name);
  });
  const centralSize = w.length - centralStart;

  w.u32(END_SIG);
  w.u16(0); // numero disco
  w.u16(0); // disco con central directory
  w.u16(entries.length);
  w.u16(entries.length);
  w.u32(centralSize);
  w.u32(centralStart);
  w.u16(0); // commento

  return w.build();
}

type Reader = { view: DataView; bytes: Uint8Array; pos: number };

function u16(r: Reader): number {
  const v = r.view.getUint16(r.pos, true);
  r.pos += 2;
  return v;
}
function u32(r: Reader): number {
  const v = r.view.getUint32(r.pos, true);
  r.pos += 4;
  return v;
}

/** Legge un archivio ZIP costruito da `buildZip` (solo STORE). Restituisce `null` se non è un archivio valido. */
export function readZip(data: Uint8Array): ZipEntry[] | null {
  // Cerca il record di fine central directory dalla coda (nessun commento nei file che scriviamo: è nei
  // 22 byte finali).
  if (data.length < 22) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endOffset = data.length - 22;
  if (view.getUint32(endOffset, true) !== END_SIG) return null;
  const count = view.getUint16(endOffset + 10, true);
  const centralStart = view.getUint32(endOffset + 16, true);

  const decoder = new TextDecoder();
  const r: Reader = { view, bytes: data, pos: centralStart };
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(r) !== CENTRAL_SIG) return null;
    r.pos += 24; // versioni, flag, metodo, orario, crc, dimensioni (non servono: si rilegge dal local header)
    const nameLen = u16(r);
    const extraLen = u16(r);
    const commentLen = u16(r);
    r.pos += 8; // disco, attributi interni/esterni
    const localOffset = u32(r);
    const name = decoder.decode(data.subarray(r.pos, r.pos + nameLen));
    r.pos += nameLen + extraLen + commentLen;

    const lr: Reader = { view, bytes: data, pos: localOffset };
    if (u32(lr) !== LOCAL_SIG) return null;
    lr.pos += 4; // versione, flag
    const method = u16(lr);
    if (method !== 0) return null; // solo STORE
    lr.pos += 8; // orario, crc (già verificato in scrittura, non ci si fida comunque del contenuto qui)
    const compSize = u32(lr);
    lr.pos += 4; // dimensione non compressa (uguale, essendo STORE)
    const localNameLen = u16(lr);
    const localExtraLen = u16(lr);
    lr.pos += localNameLen + localExtraLen;
    entries.push({ name, data: data.subarray(lr.pos, lr.pos + compSize) });
  }
  return entries;
}
