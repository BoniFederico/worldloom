import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { importWorld } from '@/lib/export/import';
import { MAX_MARKDOWN_FILES, planMarkdownImport } from '@/lib/import/markdown-plan';
import { createClient } from '@/lib/supabase/server';
import { worldNameSchema } from '@/lib/worlds/schemas';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 500 * 1024;

const back = (request: Request, error: string) =>
  NextResponse.redirect(new URL(`/worlds/import?error=${error}`, request.url), 303);

/**
 * Importa uno o più file Markdown (compatibili con Obsidian: wikilink `[[...]]`, front matter) creando un
 * mondo nuovo, uno snippet per file. Stesse difese della rotta JSON (D-021): controllo Origin, tetto di
 * dimensione, pulizia del mondo se un passaggio fallisce.
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

  const entries = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (entries.length === 0 || entries.length > MAX_MARKDOWN_FILES)
    return back(request, 'invalid_file');
  let total = 0;
  for (const file of entries) {
    if (file.size > MAX_FILE_BYTES) return back(request, 'too_large');
    total += file.size;
  }
  if (total > MAX_BYTES) return back(request, 'too_large');

  let files: { name: string; content: string }[];
  try {
    files = await Promise.all(
      entries.map(async (f) => ({ name: f.name, content: await f.text() })),
    );
  } catch {
    return back(request, 'invalid_file');
  }

  const plan = planMarkdownImport(name.data, files, randomUUID);
  if (!plan.ok) return back(request, 'invalid_file');

  const worldId = await importWorld(supabase, auth.user.id, plan);
  if (!worldId) return back(request, 'generic');
  return NextResponse.redirect(new URL(`/worlds/${worldId}?notice=imported`, request.url), 303);
}
