import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MAX_IMPORT_BYTES } from '@/lib/export/filename';
import { importWorld } from '@/lib/export/import';
import { parseExport, planImport } from '@/lib/export/world';
import { createClient } from '@/lib/supabase/server';
import { readZip } from '@/lib/zip/store';

const back = (request: Request, error: string) =>
  NextResponse.redirect(new URL(`/worlds/import?error=${error}`, request.url), 303);

/**
 * Importa l'archivio ZIP prodotto dall'export Markdown (#100): legge `_worldloom.json` dentro l'archivio e
 * lo importa esattamente come l'import JSON diretto (stesso schema, stessi limiti, stessa atomicità). I file
 * .md dell'archivio non vengono letti: sono la rappresentazione leggibile, la fedeltà viene dal JSON incluso.
 */
export async function POST(request: Request) {
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

  const declared = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return back(request, 'invalid_zip');
  if (declared > MAX_IMPORT_BYTES + 64 * 1024) return back(request, 'too_large');

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return back(request, 'invalid_zip');
  }
  if (!(file instanceof File) || file.size === 0) return back(request, 'invalid_zip');
  if (file.size > MAX_IMPORT_BYTES) return back(request, 'too_large');

  const entries = readZip(new Uint8Array(await file.arrayBuffer()));
  const meta = entries?.find((e) => e.name === '_worldloom.json');
  if (!meta) return back(request, 'invalid_zip');

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(meta.data));
  } catch {
    return back(request, 'invalid_zip');
  }
  const parsed = parseExport(json);
  if (!parsed.ok) return back(request, 'invalid_zip');
  const plan = planImport(parsed.data, randomUUID);
  if (!plan.ok) return back(request, 'invalid_zip');

  const worldId = await importWorld(supabase, auth.user.id, plan);
  if (!worldId) return back(request, 'generic');
  return NextResponse.redirect(new URL(`/worlds/${worldId}?notice=imported`, request.url), 303);
}
