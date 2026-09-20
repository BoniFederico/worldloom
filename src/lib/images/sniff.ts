// 4 MiB: sotto il limite di 4,5 MB dei corpi delle funzioni serverless su Vercel.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type ImageKind = { ext: 'png' | 'jpg' | 'webp' | 'gif'; mime: string };

const KINDS: Record<ImageKind['ext'], ImageKind> = {
  png: { ext: 'png', mime: 'image/png' },
  jpg: { ext: 'jpg', mime: 'image/jpeg' },
  webp: { ext: 'webp', mime: 'image/webp' },
  gif: { ext: 'gif', mime: 'image/gif' },
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * Riconosce il tipo reale dai byte iniziali. Il nome e il tipo dichiarati dal client non contano: un file
 * che non è PNG, JPEG, WebP o GIF (compreso SVG, che può contenere script) viene rifiutato.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return KINDS.png;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return KINDS.jpg;
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return KINDS.gif;
  }
  // WebP: "RIFF" + dimensione + "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return KINDS.webp;
  }
  return null;
}

/** Percorso pubblico (nell'app) di un'immagine del mondo. */
export const imageSrc = (worldId: string, file: string) => `/worlds/${worldId}/images/${file}`;

export const IMAGE_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/;

export const IMAGE_SRC =
  /^\/worlds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/;

export const mimeOfFile = (file: string): string | undefined =>
  Object.values(KINDS).find((k) => file.endsWith(`.${k.ext}`))?.mime;
