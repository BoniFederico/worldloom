import { crc32, deflateSync } from 'node:zlib';

/** PNG valido di `width`×`height` con un semplice sfumato: serve alle prove che hanno bisogno di un'immagine di una certa forma. */
export function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bit per canale
  header[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      rows[offset + 1 + x * 3] = 120 + Math.round((x / width) * 80);
      rows[offset + 2 + x * 3] = 170 + Math.round((y / height) * 60);
      rows[offset + 3 + x * 3] = 140;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
