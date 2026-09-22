'use client';

import { useEffect } from 'react';

/**
 * Confine errori per il layout principale stesso (#45, caso raro): sostituisce html/body, quindi niente
 * provider di i18n disponibile — testo minimo e non tradotto, coerente con la guida di Next.js su questo file.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch('/api/log/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: error.name || 'Error',
        digest: error.digest,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="it">
      <body>
        <main style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <h1>Qualcosa è andato storto</h1>
          <p>
            Si è verificato un errore imprevisto. Puoi riprovare o tornare alla pagina iniziale.
          </p>
          <button type="button" onClick={reset}>
            Riprova
          </button>{' '}
          {/* Niente next/link: questo file sostituisce l'intero documento quando il layout principale stesso è
              fallito, quindi si evita ogni dipendenza aggiuntiva dal router. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Torna alla pagina iniziale</a>
        </main>
      </body>
    </html>
  );
}
