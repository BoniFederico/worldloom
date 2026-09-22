import { logError } from '@/lib/logger';

/**
 * Tracciamento errori server (#45): Next.js chiama questo hook per ogni errore non gestito nel rendering
 * o nelle route. Si registrano solo percorso, metodo e tipo di errore — mai il messaggio (potrebbe incorporare
 * input dell'utente) — così i log restano senza dati personali e visibili nella dashboard log di Vercel.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType: string },
) {
  logError('request_error', {
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    errorName: error instanceof Error ? error.name : 'unknown',
    digest:
      error && typeof error === 'object' && 'digest' in error
        ? String((error as { digest: unknown }).digest)
        : undefined,
  });
}
