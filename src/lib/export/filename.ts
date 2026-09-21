/** Tetto del file di importazione, sotto i 4,5 MB delle funzioni Vercel. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** Nome di file ASCII sicuro ricavato dal nome del mondo. */
export function fileNameOf(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return slug || 'mondo';
}
