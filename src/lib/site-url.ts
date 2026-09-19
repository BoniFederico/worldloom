type Env = Record<string, string | undefined>;

/**
 * URL pubblico dell'app per i link nelle email di auth. Non deriva mai da Origin/Host della richiesta
 * (controllati dal client: password-reset poisoning). `VERCEL_URL` lo imposta la piattaforma.
 */
export function resolveSiteUrl(env: Env = process.env): string {
  const explicit = env.SITE_URL;
  if (explicit) {
    let url: URL;
    try {
      url = new URL(explicit);
    } catch {
      throw new Error('SITE_URL non è un URL valido');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('SITE_URL deve usare http o https');
    }
    return url.origin;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
