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

  // Chiave `errorName`, non `name`: quest'ultima è nella lista di redazione del logger (pensata per un nome
  // visualizzato), che vanificherebbe l'utilità del log qui.
  logError('client_error', {
    errorName: parsed.data.name,
    digest: parsed.data.digest,
    path: parsed.data.path,
  });
  return new NextResponse(null, { status: 204 });
}
