import { describe, expect, it } from 'vitest';
import { IMAGE_FILE, IMAGE_SRC, mimeOfFile, sniffImage } from './sniff';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('sniffImage', () => {
  it('riconosce PNG, JPEG, GIF e WebP dai byte iniziali', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe('png');
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe('jpg');
    expect(sniffImage(bytes(...ascii('GIF89a')))?.ext).toBe('gif');
    expect(sniffImage(bytes(...ascii('GIF87a')))?.ext).toBe('gif');
    expect(sniffImage(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')))?.ext).toBe('webp');
  });

  it('rifiuta SVG, HTML, testo e file vuoti anche se il nome dice il contrario', () => {
    expect(
      sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("non sono un'immagine"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it('un RIFF che non è WebP (es. WAV) viene rifiutato', () => {
    expect(sniffImage(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')))).toBeNull();
  });
});

describe('percorsi', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  it('accetta solo percorsi interni ben formati', () => {
    expect(IMAGE_SRC.test(`/worlds/${uuid}/images/${uuid}.png`)).toBe(true);
    for (const bad of [
      `https://evil.test/${uuid}.png`,
      `/worlds/${uuid}/images/${uuid}.svg`,
      `/worlds/${uuid}/images/../${uuid}.png`,
      `//evil.test/worlds/${uuid}/images/${uuid}.png`,
      `/worlds/${uuid}/images/${uuid}.png?x=1`,
      'javascript:alert(1)',
    ]) {
      expect(IMAGE_SRC.test(bad)).toBe(false);
    }
  });
  it('il nome file ammesso è uuid + estensione nota', () => {
    expect(IMAGE_FILE.test(`${uuid}.webp`)).toBe(true);
    expect(IMAGE_FILE.test(`${uuid}.svg`)).toBe(false);
    expect(IMAGE_FILE.test(`x.png`)).toBe(false);
  });
  it('il tipo si ricava dall’estensione', () => {
    expect(mimeOfFile(`${uuid}.jpg`)).toBe('image/jpeg');
    expect(mimeOfFile(`${uuid}.exe`)).toBeUndefined();
  });
});
