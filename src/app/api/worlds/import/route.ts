import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MAX_IMPORT_BYTES } from '@/lib/export/filename';
import { importWorld } from '@/lib/export/import';
import { parseExport, planImport } from '@/lib/export/world';
import { createClient } from '@/lib/supabase/server';

/** Reindirizza al form con il codice d'errore (un valore fisso, mai testo proveniente dal file). */
const back = (request: Request, error: string) =>
  NextResponse.redirect(new URL(`/worlds/import?error=${error}`, request.url), 303);

/**
 * Importa un file JSON di Worldloom creando un mondo nuovo di cui l'utente è proprietario.
 * Il contenuto è validato (schema, riferimenti, limiti) e ogni testo sanificato prima di scrivere.
 */
export async function POST(request: Request) {
  // Difesa in profondità contro richieste da altri siti: l'Origin, se presente, deve essere l'host pubblico.
  const origin = request.headers.get('origin');
  if (origin) {
    const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host')];
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {}
    if (!originHost || !hosts.includes(originHost)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.redirect(new URL('/login?next=%2Fworlds%2Fimport', request.url), 303);

  // Si esige una lunghezza dichiarata valida, così il corpo non viene letto in memoria senza un tetto.
  const declared = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return back(request, 'invalid_file');
  if (declared > MAX_IMPORT_BYTES + 64 * 1024) return back(request, 'too_large');

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return back(request, 'invalid_file');
  }
  if (!(file instanceof File) || file.size === 0) return back(request, 'invalid_file');
  if (file.size > MAX_IMPORT_BYTES) return back(request, 'too_large');

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return back(request, 'invalid_file');
  }
  const parsed = parseExport(json);
  if (!parsed.ok) return back(request, 'invalid_file');
  const plan = planImport(parsed.data, randomUUID);
  if (!plan.ok) return back(request, 'invalid_file');

  const worldId = await importWorld(supabase, auth.user.id, plan);
  if (!worldId) return back(request, 'generic');
  return NextResponse.redirect(new URL(`/worlds/${worldId}?notice=imported`, request.url), 303);
}
