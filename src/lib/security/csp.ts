/**
 * Content-Security-Policy (#46): calcolata per richiesta nel middleware (serve un nonce nuovo ogni volta,
 * per gli script che Next.js stesso inietta per l'hydration). Nessuno script esterno, nessuno stile in un
 * tag `<style>` separato da quello che genera React: verificato che l'app non usa `next/script`,
 * `dangerouslySetInnerHTML` né font esterni (i font sono auto-ospitati da `next/font/google`, D-010).
 */
export function buildCsp(nonce: string, supabaseUrl: string): string {
  const ws = supabaseUrl.replace(/^http/, 'ws');
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Gli attributi `style` in linea di React non hanno un nonce applicabile: 'unsafe-inline' qui è il
    // compromesso raccomandato dalla guida CSP di Next.js stessa, il rischio (iniezione di solo CSS) è
    // molto più limitato di quello per gli script.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self'`,
    `font-src 'self'`,
    `connect-src 'self' ${supabaseUrl} ${ws}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  // In locale il Supabase di sviluppo gira su http://127.0.0.1: «upgrade-insecure-requests» forzerebbe
  // anche quelle richieste su https, che lì non esiste. Il Supabase cloud è sempre https.
  if (supabaseUrl.startsWith('https:')) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
