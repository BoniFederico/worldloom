import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { clientErrorSchema } from '@/lib/logging/client-error-schema';

/**
 * Riceve la segnalazione di un errore React lato client (dal componente `error.tsx`) e lo registra con
 * lo stesso logger strutturato del server (#45). Nessun dato personale accettato: solo nome dell'errore,
 * digest opaco di Next e percorso della pagina.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  logError('client_error', parsed.data);
  return new NextResponse(null, { status: 204 });
}
