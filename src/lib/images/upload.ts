import { randomUUID } from 'node:crypto';
import type { createClient } from '@/lib/supabase/server';
import { MAX_IMAGE_BYTES, sniffImage, type ImageKind } from './sniff';

type Client = Awaited<ReturnType<typeof createClient>>;

export const IMAGE_BUCKET = 'world-images';

export type UploadFailure = {
  error: 'forbidden' | 'invalid' | 'too_large' | 'unsupported';
  status: number;
};

/**
 * Difesa in profondità contro richieste da altri siti: l'Origin, se presente, deve essere l'host pubblico
 * (anche dietro un proxy, dove `request.url` può avere l'host interno).
 */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host')];
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

/**
 * Legge dal corpo multipart il campo `file` e ne verifica dimensione e tipo reale (dai byte, mai da nome o
 * Content-Type). Si esige una lunghezza dichiarata valida, così il corpo non viene letto in memoria senza un tetto.
 */
export async function readImageUpload(
  request: Request,
): Promise<{ bytes: Uint8Array; kind: ImageKind; form: FormData } | UploadFailure> {
  const declared = Number(request.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return { error: 'invalid', status: 411 };
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return { error: 'too_large', status: 413 };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { error: 'invalid', status: 400 };
  }
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'invalid', status: 400 };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'too_large', status: 413 };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return { error: 'unsupported', status: 415 };
  return { bytes, kind, form };
}

/** Salva l'immagine con un nome casuale e un'estensione scelta da noi. Restituisce il nome del file, o `null` se fallisce. */
export async function storeImage(
  supabase: Client,
  worldId: string,
  bytes: Uint8Array,
  kind: ImageKind,
): Promise<string | null> {
  const name = `${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(`${worldId}/${name}`, bytes, { contentType: kind.mime, upsert: false });
  return error ? null : name;
}
