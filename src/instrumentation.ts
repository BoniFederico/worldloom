import { logError } from '@/lib/logger';

/**
 * Tracciamento errori server (#45): Next.js chiama questo hook per ogni errore non gestito nel rendering
 * o nelle route. Si registrano solo percorso, metodo e tipo di errore — mai il messaggio (potrebbe incorporare
 * input dell'utente) — così i log restano senza dati personali e visibili nella dashboard log di Vercel.
 * `request.path` include la query string (es. `/auth/callback?code=...`, che porta un codice PKCE monouso):
 * si registra solo il pathname, mai i parametri.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType: string },
) {
  logError('request_error', {
    path: request.path.split('?')[0],
    method: request.method,
    routeType: context.routeType,
    errorName: error instanceof Error ? error.name : 'unknown',
    digest:
      error &&
      typeof error === 'object' &&
      typeof (error as { digest?: unknown }).digest === 'string'
        ? (error as { digest: string }).digest
        : undefined,
  });
}
