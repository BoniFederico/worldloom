import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { importWorld } from '@/lib/export/import';
import { planCsvImport } from '@/lib/import/csv-plan';
import { parseCsv } from '@/lib/import/csv';
import { createClient } from '@/lib/supabase/server';
import { worldNameSchema } from '@/lib/worlds/schemas';

const MAX_BYTES = 4 * 1024 * 1024;

const back = (request: Request, error: string) =>
  NextResponse.redirect(new URL(`/worlds/import?error=${error}`, request.url), 303);

/**
 * Importa un file CSV creando un mondo nuovo: la prima riga sono le intestazioni, ogni riga uno snippet,
 * le colonne diverse dal titolo diventano campi di testo di un'unica categoria generata per l'occasione.
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
  if (!Number.isFinite(declared) || declared <= 0) return back(request, 'invalid_file');
  if (declared > MAX_BYTES + 64 * 1024) return back(request, 'too_large');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(request, 'invalid_file');
  }

  const name = worldNameSchema.safeParse(String(form.get('name') ?? ''));
  if (!name.success) return back(request, 'invalid_name');
  const categoryName = String(form.get('category') ?? '').trim() || 'Importato';

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return back(request, 'invalid_file');
  if (file.size > MAX_BYTES) return back(request, 'too_large');

  let text: string;
  try {
    text = await file.text();
  } catch {
    return back(request, 'invalid_file');
  }

  const plan = planCsvImport(name.data, categoryName, parseCsv(text), randomUUID);
  if (!plan.ok) return back(request, 'invalid_file');

  const worldId = await importWorld(supabase, auth.user.id, plan);
  if (!worldId) return back(request, 'generic');
  return NextResponse.redirect(new URL(`/worlds/${worldId}?notice=imported`, request.url), 303);
}
